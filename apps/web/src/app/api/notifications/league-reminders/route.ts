/**
 * Per-fixture league reminder cron. Fires ~24h before each scheduled
 * `league_schedule_matches` fixture and pings both teams' **active** rostered
 * players (`league.match.reminder`). The orchestration / window / cap lives in
 * [sweep.ts](./sweep.ts) behind a port; this file wires the concrete Supabase
 * reads + `notify` + the `CRON_SECRET` gate (mirrors the event-reminder cron).
 *
 * Vercel Cron is production-only, so this never fires on dev/preview (same
 * constraint as the worker + event reminders) — verify on production.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';
import {
  runLeagueReminderSweep,
  type DueFixture,
  type FixtureSide,
  type LeagueReminderDispatch,
  type LeagueReminderPort,
} from './sweep';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Local Row type — the generated types lag the 20260910 entry-id cutover, so
 * the entry columns are read via `select('*')`-style casts (repo convention). */
type MatchRow = {
  id: string;
  division_id: string;
  home_entry_id: string | null;
  away_entry_id: string | null;
  scheduled_at: string;
  court_label: string | null;
};

function makeLeagueReminderPort(admin: AdminClient): LeagueReminderPort {
  return {
    async findDueFixtures(windowStart, windowEnd, limit) {
      const { data: matchRows } = await admin
        .from('league_schedule_matches')
        .select('id, division_id, home_entry_id, away_entry_id, scheduled_at, court_label')
        .eq('status', 'scheduled')
        .is('reminded_at', null)
        .gte('scheduled_at', windowStart.toISOString())
        .lt('scheduled_at', windowEnd.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(limit);
      // Only fully-scheduled fixtures (both entries assigned) are remindable.
      const matches = ((matchRows as unknown as MatchRow[] | null) ?? []).filter(
        (m) => m.home_entry_id && m.away_entry_id,
      );
      if (matches.length === 0) return [];

      // division → event (title) for the message + deep link.
      const divisionIds = [...new Set(matches.map((m) => m.division_id))];
      const { data: divRows } = await admin
        .from('event_divisions')
        .select('id, event_id')
        .in('id', divisionIds);
      const divToEvent = new Map(
        ((divRows as { id: string; event_id: string }[] | null) ?? []).map((d) => [
          d.id,
          d.event_id,
        ]),
      );
      const { data: evRows } = await admin
        .from('events')
        .select('id, title')
        .in('id', [...new Set([...divToEvent.values()])]);
      const eventTitle = new Map(
        ((evRows as { id: string; title: string }[] | null) ?? []).map((e) => [e.id, e.title]),
      );

      // entry → { display name, team }.
      const entryIds = [...new Set(matches.flatMap((m) => [m.home_entry_id!, m.away_entry_id!]))];
      const { data: entryRows } = await admin
        .from('event_team_entries')
        .select('id, display_name, team_id')
        .in('id', entryIds);
      const entryInfo = new Map(
        (
          (entryRows as { id: string; display_name: string; team_id: string | null }[] | null) ?? []
        ).map((e) => [e.id, { name: e.display_name, teamId: e.team_id }] as const),
      );

      // team → active rostered players.
      const teamIds = [
        ...new Set(
          [...entryInfo.values()].map((e) => e.teamId).filter((t): t is string => Boolean(t)),
        ),
      ];
      const teamMembers = new Map<string, string[]>();
      if (teamIds.length > 0) {
        const { data: memRows } = await admin
          .from('team_members')
          .select('team_id, user_id')
          .in('team_id', teamIds)
          .eq('status', 'active');
        for (const r of (memRows as { team_id: string; user_id: string }[] | null) ?? []) {
          const arr = teamMembers.get(r.team_id) ?? [];
          arr.push(r.user_id);
          teamMembers.set(r.team_id, arr);
        }
      }

      const side = (entryId: string): FixtureSide => {
        const info = entryInfo.get(entryId);
        return {
          teamName: info?.name ?? 'your opponent',
          userIds: info?.teamId ? (teamMembers.get(info.teamId) ?? []) : [],
        };
      };

      const fixtures: DueFixture[] = [];
      for (const m of matches) {
        const eventId = divToEvent.get(m.division_id);
        if (!eventId) continue;
        fixtures.push({
          matchId: m.id,
          eventId,
          eventTitle: eventTitle.get(eventId) ?? 'your league',
          scheduledAt: m.scheduled_at,
          courtLabel: m.court_label,
          home: side(m.home_entry_id!),
          away: side(m.away_entry_id!),
        });
      }
      return fixtures;
    },

    async markReminded(matchIds) {
      if (matchIds.length === 0) return;
      await admin
        .from('league_schedule_matches')
        .update({ reminded_at: new Date().toISOString() } as never)
        .in('id', matchIds);
    },
  };
}

function authorized(request: Request): boolean {
  const secret = process.env['CRON_SECRET'];
  if (!secret) return true; // dev fallback
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  const dispatch: LeagueReminderDispatch = (kind, userId, payload, opts) =>
    notify(kind, userId, payload, opts);
  try {
    const result = await runLeagueReminderSweep(
      makeLeagueReminderPort(admin),
      dispatch,
      new Date(),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await log.error('[league-reminders-cron] failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
