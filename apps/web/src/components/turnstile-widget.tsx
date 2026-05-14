'use client';

import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile widget. Renders an invisible/managed challenge and
 * writes the resulting token into a hidden input named `cf-turnstile-response`
 * inside the surrounding <form>, so the server action picks it up via
 * `formData.get('cf-turnstile-response')`.
 *
 * Requires NEXT_PUBLIC_TURNSTILE_SITE_KEY at build time. If unset the widget
 * renders nothing (server side accepts the missing token in dev).
 */
declare global {
    interface Window {
        turnstile?: {
            render: (
                el: HTMLElement,
                opts: { sitekey: string; theme?: 'light' | 'dark' | 'auto'; size?: 'normal' | 'flexible' | 'compact' },
            ) => string;
        };
    }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export function TurnstileWidget() {
    const ref = useRef<HTMLDivElement | null>(null);
    const siteKey = process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY'];

    useEffect(() => {
        if (!siteKey || !ref.current) return;

        const ensureScript = () => {
            if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return Promise.resolve();
            return new Promise<void>((resolve) => {
                const s = document.createElement('script');
                s.src = SCRIPT_SRC;
                s.async = true;
                s.defer = true;
                s.onload = () => resolve();
                document.head.appendChild(s);
            });
        };

        let cancelled = false;
        void ensureScript().then(() => {
            if (cancelled || !ref.current || !window.turnstile) return;
            window.turnstile.render(ref.current, { sitekey: siteKey, theme: 'auto' });
        });
        return () => {
            cancelled = true;
        };
    }, [siteKey]);

    if (!siteKey) return null;
    return <div ref={ref} className="cf-turnstile" />;
}
