import { renderBracketWatchOg } from '../_og';

/**
 * Division-aware OG image route. Read by `generateMetadata` in the watch
 * page when a viewer shares a `?division=X` URL — the resulting meta
 * tag is `<meta property="og:image" content=".../og?division=X" />` so
 * unfurlers pull the right card.
 *
 * Distinct from `opengraph-image.tsx` (the file-convention default)
 * because that handler can't see query strings; this one can.
 *
 * The same `renderBracketWatchOg` helper does the actual rendering, so
 * the visual treatment stays consistent across both entry points.
 */

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const division = url.searchParams.get('division');
  return renderBracketWatchOg(id, division);
}
