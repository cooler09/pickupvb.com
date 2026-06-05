import { formatEventDateLong } from '@/lib/date-formats';
import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';
import { loadCommunityDetailPublic } from './community-detail-cache';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Community volleyball listing on PickupVB';

/**
 * Tailored OG card for community listings (SEO audit P3 #9) so shares unfurl
 * with the listing title + date/place instead of the generic root card, on par
 * with the events/teams/groups/players cards. Viewer-independent read (null
 * viewer) — RLS exposes only the same public rows the detail page shows.
 */
export default async function Image({ params }: { params: { slug: string } }) {
  try {
    const detail = await loadCommunityDetailPublic(params.slug);
    if (!detail) {
      return brandOgImage({
        eyebrow: 'PickupVB',
        title: 'Community volleyball listing',
        meta: 'pickupvb.com',
      });
    }
    const place = [detail.location?.city, detail.location?.region].filter(Boolean).join(', ');
    const dateLabel = formatEventDateLong(detail.startsAt, detail.timeZone);
    return brandOgImage({
      eyebrow: 'Community listing',
      title: detail.title,
      meta: [dateLabel, place].filter(Boolean).join(' · '),
    });
  } catch {
    return brandOgImage({
      eyebrow: 'PickupVB',
      title: 'Community volleyball listing',
      meta: 'pickupvb.com',
    });
  }
}
