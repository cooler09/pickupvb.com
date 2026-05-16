import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'PickupVB — Find, host, and join pickup volleyball events';

export default function Image() {
    return brandOgImage({
        eyebrow: 'PickupVB',
        title: 'Find, host, and join pickup volleyball events',
        meta: 'Indoor · Grass · Beach · Open play & tournaments',
    });
}
