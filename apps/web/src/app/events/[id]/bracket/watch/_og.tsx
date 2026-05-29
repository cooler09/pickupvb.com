import type { BracketFormat, Match } from '@pickupvb/domain';
import { GetEventDetailQuery } from '@pickupvb/application';
import { brandOgImage } from '@/lib/og-image';
import { handlers, repositories } from '@/lib/handlers';

/**
 * Shared renderer for the bracket spectator OG card. Used by both the
 * file-convention `opengraph-image.tsx` (which can only key off the
 * `[id]` segment) and the `og/route.ts` handler (which can also read a
 * `?division=` query for per-division previews).
 *
 * Returns the same `ImageResponse` shape `brandOgImage` returns so
 * callers can return its result directly.
 *
 * Defensive: all data fetches sit inside this helper's try/catch.
 * On any failure (404, non-tournament, missing division) we still
 * return a valid card so unfurlers never see a broken-link icon.
 */
export async function renderBracketWatchOg(
  eventId: string,
  divisionIdHint?: string | null,
): Promise<ReturnType<typeof brandOgImage>> {
  try {
    const event = await handlers.getEventDetail.execute(new GetEventDetailQuery(eventId, null));
    if (event.type !== 'tournament' || event.divisions.length === 0) {
      return brandOgImage({
        eyebrow: 'Live bracket',
        title: event.title,
        meta: 'pickupvb.com',
      });
    }
    const division =
      (divisionIdHint && event.divisions.find((d) => d.id === divisionIdHint)) ||
      event.divisions[0]!;
    const [bracket, teams] = await Promise.all([
      repositories.bracketRepo.findByDivisionId(division.id as never),
      repositories.bracketRepo.listRegisteredTeams(event.id as never, division.id as never),
    ]);

    const teamNameById = new Map(teams.map((t) => [t.teamId, t.name]));
    const formatLabel = bracket ? FORMAT_LABEL[bracket.format] : null;
    const isMulti = event.divisions.length > 1;

    // Champion takes priority over the generic "Final results" label.
    let eyebrow = 'Live bracket';
    if (bracket?.status === 'completed') {
      const champ = pickChampion(bracket.matches);
      const champName = champ ? teamNameById.get(champ) : null;
      eyebrow = champName ? `Champion: ${champName}` : 'Final results';
    } else if (bracket?.status === 'active') {
      eyebrow = 'Live bracket';
    } else {
      eyebrow = 'Bracket pending';
    }

    const statusMeta = bracket
      ? bracket.status === 'completed'
        ? null
        : bracket.status === 'active'
          ? 'In progress'
          : 'Seeding'
      : 'Setup';
    const teamCount = `${teams.length} team${teams.length === 1 ? '' : 's'}`;
    const divisionLabel = isMulti ? division.label : null;
    const meta = [statusMeta, teamCount, formatLabel, divisionLabel].filter(Boolean).join(' · ');

    return brandOgImage({
      eyebrow,
      title: event.title,
      meta,
      cta: 'Watch live at pickupvb.com',
    });
  } catch {
    return brandOgImage({
      eyebrow: 'Live bracket',
      title: 'Tournament bracket',
      meta: 'pickupvb.com',
    });
  }
}

const FORMAT_LABEL: Record<BracketFormat, string> = {
  single_elimination: 'Single elimination',
  double_elimination: 'Double elimination',
  round_robin: 'Round robin',
  pool_play_playoff: 'Pool play → playoff',
};

/**
 * Returns the champion team id for a completed bracket.
 *
 *   • Single elim / pool playoff: the highest-round completed match
 *     with no `advancesToMatchId` set (i.e. the terminal final).
 *   • Double elim: the `bracketSide === 'final'` match (grand final).
 *   • Round robin: best-record team via standings is out of scope here;
 *     a completed round-robin shows "Final results" instead of a name.
 *
 * Returns null when no clear champion can be derived.
 */
function pickChampion(matches: ReadonlyArray<Match>): string | null {
  const finals = matches.filter((m) => m.bracketSide === 'final' && m.status === 'completed');
  if (finals.length > 0) {
    const grand = finals.sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0]!;
    return grand.winnerEntryId ?? null;
  }
  const terminals = matches.filter(
    (m) => m.status === 'completed' && !m.advancesToMatchId && m.winnerEntryId,
  );
  if (terminals.length === 0) return null;
  const last = terminals.sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0]!;
  return last.winnerEntryId ?? null;
}
