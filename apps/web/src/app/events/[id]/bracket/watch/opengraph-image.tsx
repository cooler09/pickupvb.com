import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';
import { renderBracketWatchOg } from './_og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Live tournament bracket on PickupVB';

/**
 * File-convention OG image for the bracket spectator route. This handler
 * only sees the dynamic `[id]` segment — it cannot read `?division=`,
 * so multi-division tournaments fall back to the first division here.
 *
 * Per-division previews are served from `og/route.ts` and surfaced via
 * `generateMetadata` on the watch page (which sets `openGraph.images`
 * to a URL that includes the active division id). Crawlers that ignore
 * meta tags and just look for the file convention still get a valid card.
 */
export default async function Image({ params }: { params: { id: string } }) {
  return renderBracketWatchOg(params.id);
}
