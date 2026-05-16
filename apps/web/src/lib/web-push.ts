/**
 * Web push delivery adapter. Wraps the `web-push` library and provides
 * a typed payload shape that mirrors what the service worker (public/sw.js)
 * expects to receive.
 *
 * Env vars (set in Vercel + .env.local):
 *   - VAPID_PUBLIC_KEY            (also exposed as NEXT_PUBLIC_VAPID_PUBLIC_KEY for the client)
 *   - VAPID_PRIVATE_KEY
 *   - VAPID_SUBJECT               (mailto:ops@pickupvb.com or your site URL)
 *
 * Generate keys once with:
 *   node -e "console.log(require('web-push').generateVAPIDKeys())"
 */
import webpush from 'web-push';

export type WebPushPayload = {
    title: string;
    body: string;
    href?: string;
    tag?: string;
};

export type WebPushSubscription = {
    endpoint: string;
    p256dh: string;
    auth: string;
};

let configured = false;

function configure(): boolean {
    if (configured) return true;
    const publicKey = process.env['VAPID_PUBLIC_KEY'];
    const privateKey = process.env['VAPID_PRIVATE_KEY'];
    const subject = process.env['VAPID_SUBJECT'] ?? 'mailto:ops@pickupvb.com';
    if (!publicKey || !privateKey) return false;
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
    return true;
}

export type WebPushResult =
    | { ok: true }
    | { ok: false; statusCode: number; gone: boolean; message: string };

/**
 * Send a push payload to one subscription. Returns `{ ok: false, gone: true }`
 * when the endpoint is 404/410 — the caller should delete the row.
 */
export async function sendWebPush(
    sub: WebPushSubscription,
    payload: WebPushPayload,
): Promise<WebPushResult> {
    if (!configure()) {
        return { ok: false, statusCode: 0, gone: false, message: 'vapid-not-configured' };
    }
    try {
        await webpush.sendNotification(
            {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
            { TTL: 60 * 60 * 24 },
        );
        return { ok: true };
    } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string };
        const code = e.statusCode ?? 0;
        return {
            ok: false,
            statusCode: code,
            gone: code === 404 || code === 410,
            message: e.message ?? 'web-push-failed',
        };
    }
}
