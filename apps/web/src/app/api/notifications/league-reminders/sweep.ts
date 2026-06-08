/**
 * Per-fixture league reminder sweep core. Pure orchestration over an injected
 * `LeagueReminderPort` + dispatch fn — no Supabase, no `next/*` — so the
 * window / cap / opponent-mapping / dedupe is unit-testable (mirrors
 * `runReminderSweep` for event-attendee reminders).
 *
 * Design (docs/journal/2026-06-06-bundle-league-match-reminders.md):
 * - **Audience = rostered players of both teams** in a fixture. Walk-in
 *   (account-less) entries have no roster, so they're only ever the *opponent*,
 *   never a recipient.
 * - **One 24h window.** A fixture is reminded when it's ~24h out (22h–26h); the
 *   wide window + a per-match `reminded_at` dedupe means a match pings once even
 *   though the cron fires several times inside the window.
 * - **Mark per fixture, after its recipients are dispatched.** A timeout mid-run
 *   only strands the *un-dispatched* fixtures (they stay unmarked for the next
 *   run); the per-recipient `matchId:userId` idempotency key keeps a re-run from
 *   re-mailing/re-pushing the ones already done.
 */

/** Cap fixtures per run so a busy week stays inside the route's `maxDuration`. */
export const MAX_FIXTURES_PER_RUN = 60;
/** Fan-out concurrency for a fixture's roster dispatches. */
export const DISPATCH_CONCURRENCY = 8;
/** 24h-before window, in minutes-from-now. */
export const WINDOW_FROM_MIN = 22 * 60;
export const WINDOW_TO_MIN = 26 * 60;

export type FixtureSide = {
  /** The team's display name (roster or walk-in). */
  teamName: string;
  /** Rostered player user ids (empty for a walk-in / account-less team). */
  userIds: string[];
};

export type DueFixture = {
  matchId: string;
  eventId: string;
  eventTitle: string;
  scheduledAt: string;
  courtLabel: string | null;
  /** IANA zone of the event; the kickoff time renders in it. */
  timeZone: string | null;
  home: FixtureSide;
  away: FixtureSide;
};

export type LeagueReminderPayload = {
  eventId: string;
  eventTitle: string;
  opponentName: string;
  scheduledAt: string;
  courtLabel: string | null;
  timeZone?: string;
};

export interface LeagueReminderPort {
  /** Scheduled, not-yet-reminded fixtures whose kickoff falls in the window. */
  findDueFixtures(windowStart: Date, windowEnd: Date, limit: number): Promise<DueFixture[]>;
  /** Stamp `reminded_at` so the match isn't reminded again in the window. */
  markReminded(matchIds: string[]): Promise<void>;
}

export type LeagueReminderDispatch = (
  kind: 'league.match.reminder',
  userId: string,
  payload: LeagueReminderPayload,
  opts: { idempotencyKey: string },
) => Promise<void>;

export type LeagueSweepResult = { fixtures: number; reminders: number };

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function runLeagueReminderSweep(
  port: LeagueReminderPort,
  dispatch: LeagueReminderDispatch,
  now: Date = new Date(),
): Promise<LeagueSweepResult> {
  const windowStart = new Date(now.getTime() + WINDOW_FROM_MIN * 60_000);
  const windowEnd = new Date(now.getTime() + WINDOW_TO_MIN * 60_000);
  const fixtures = await port.findDueFixtures(windowStart, windowEnd, MAX_FIXTURES_PER_RUN);

  let reminders = 0;
  for (const fx of fixtures) {
    // Each side is reminded with the *other* team as their opponent. A user who
    // (somehow) sits on both rosters is pinged once for the fixture.
    const seen = new Set<string>();
    const jobs: Array<{ userId: string; opponentName: string }> = [];
    for (const userId of fx.home.userIds) {
      if (seen.has(userId)) continue;
      seen.add(userId);
      jobs.push({ userId, opponentName: fx.away.teamName });
    }
    for (const userId of fx.away.userIds) {
      if (seen.has(userId)) continue;
      seen.add(userId);
      jobs.push({ userId, opponentName: fx.home.teamName });
    }

    await runWithConcurrency(jobs, DISPATCH_CONCURRENCY, async (job) => {
      try {
        await dispatch(
          'league.match.reminder',
          job.userId,
          {
            eventId: fx.eventId,
            eventTitle: fx.eventTitle,
            opponentName: job.opponentName,
            scheduledAt: fx.scheduledAt,
            courtLabel: fx.courtLabel,
            ...(fx.timeZone ? { timeZone: fx.timeZone } : {}),
          },
          { idempotencyKey: `${fx.matchId}:${job.userId}` },
        );
        reminders += 1;
      } catch {
        // best-effort per recipient
      }
    });

    // Mark only after this fixture's recipients are dispatched, so a timeout
    // leaves later fixtures unmarked for the next run rather than stranding them.
    await port.markReminded([fx.matchId]);
  }

  return { fixtures: fixtures.length, reminders };
}
