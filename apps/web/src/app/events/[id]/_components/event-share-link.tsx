'use client';

import { ShareLink } from '@/components/share-link';

/**
 * Event-specific wrapper around the generic `ShareLink`. Always shares
 * the canonical short URL `/e/<shortCode>` so the displayed identifier
 * matches the URL the recipient will receive (great for reading codes
 * over the phone or stamping on flyers/QR posters).
 */
export function EventShareLink({
    shortCode,
    title,
}: {
    shortCode: string;
    title?: string;
}) {
    return (
        <ShareLink
            path={`/e/${shortCode}`}
            code={shortCode}
            {...(title ? { title } : {})}
        />
    );
}
