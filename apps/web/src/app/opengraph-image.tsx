import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'PickupVB — Find and host volleyball events';

export default function Image() {
    return brandOgImage({
        eyebrow: 'PickupVB',
        title: 'Find and host volleyball events',
        meta: 'Indoor · Grass · Beach · Tournaments',
    });
}
