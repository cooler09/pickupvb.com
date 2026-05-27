import { GetEventDetailQuery } from '@pickupvb/application';
import type { BracketFormat } from '@pickupvb/domain';
import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';
import { handlers, repositories } from '@/lib/handlers';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Live tournament bracket on PickupVB';

const FORMAT_LABEL: Record<BracketFormat, string> = {
  single_elimination: 'Single elimination',
  double_elimination: 'Double elimination',
  round_robin: 'Round robin',
  pool_play_playoff: 'Pool play → playoff',
};

/**
 * Share-preview card for the public spectator bracket route. Falls back
 * to a generic "Live bracket" card when the event lookup fails (404 /
 * non-tournament / no divisions yet) so unfurlers always get a valid
 * image instead of a broken-link icon.
 *
 * Mirrors the eyebrow/title/meta shape of the parent event card so the
 * two share previews feel like siblings, with "Live bracket" as the
 * differentiator.
 */
export default async function Image({ params }: { params: { id: string } }) {
  try {
    const event = await handlers.getEventDetail.execute(new GetEventDetailQuery(params.id, null));
    if (event.type !== 'tournament' || event.divisions.length === 0) {
      return brandOgImage({
        eyebrow: 'Live bracket',
        title: event.title,
        meta: 'pickupvb.com',
      });
    }
    const division = event.divisions[0]!;
    const [bracket, teams] = await Promise.all([
      repositories.bracketRepo.findByDivisionId(division.id as never),
      repositories.bracketRepo.listRegisteredTeams(event.id as never, division.id as never),
    ]);
    const formatLabel = bracket ? FORMAT_LABEL[bracket.format] : null;
    const statusLabel = bracket
      ? bracket.status === 'completed'
        ? 'Final results'
        : bracket.status === 'active'
          ? 'In progress'
          : 'Seeding'
      : 'Bracket pending';
    const teamCount = `${teams.length} team${teams.length === 1 ? '' : 's'}`;
    const meta = [statusLabel, teamCount, formatLabel].filter(Boolean).join(' · ');
    return brandOgImage({
      eyebrow: 'Live bracket',
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
