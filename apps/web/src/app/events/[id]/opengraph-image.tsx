import { GetEventDetailQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { formatEventDateLong } from '@/lib/date-formats';
import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Volleyball event on PickupVB';

export default async function Image({ params }: { params: { id: string } }) {
  try {
    const event = await handlers.getEventDetail.execute(new GetEventDetailQuery(params.id, null));
    const placeLabel = `${event.location.city}, ${event.location.region}`;
    const surfaceLabel =
      event.surface === 'sand' ? 'Beach' : event.surface === 'grass' ? 'Grass' : 'Indoor';
    const typeLabel = event.type === 'tournament' ? 'Tournament' : 'Open play';
    return brandOgImage({
      eyebrow: `${surfaceLabel} · ${typeLabel}`,
      title: event.title,
      meta: `${formatEventDateLong(event.startsAt, event.timeZone)} · ${placeLabel}`,
    });
  } catch {
    return brandOgImage({
      eyebrow: 'PickupVB',
      title: 'Volleyball event',
      meta: 'pickupvb.com',
    });
  }
}
