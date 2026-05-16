'use client';

import { useEffect, useState } from 'react';

/**
 * Compact share control: a single button that uses the Web Share API on
 * supported devices (mobile sheet) and falls back to copy-to-clipboard on
 * desktop. The full URL is also exposed via `title` for hover/long-press
 * preview, and a tiny muted hint underneath shows the short code so users
 * can read it back over the phone.
 */
export function EventShareLink({
    shortCode,
    title,
}: {
    shortCode: string;
    title?: string;
}) {
    const [origin, setOrigin] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'copied' | 'shared'>('idle');
    const [canShare, setCanShare] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setOrigin(window.location.origin);
            setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
        }
    }, []);

    const path = `/e/${shortCode}`;
    const url = origin ? `${origin}${path}` : path;

    async function onClick() {
        if (canShare) {
            try {
                await navigator.share({
                    url,
                    ...(title ? { title, text: title } : {}),
                });
                setStatus('shared');
                setTimeout(() => setStatus('idle'), 1500);
                return;
            } catch {
                // User dismissed or share failed — fall through to clipboard.
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            setStatus('copied');
            setTimeout(() => setStatus('idle'), 1500);
        } catch {
            // Clipboard unavailable (insecure origin); leave status idle.
        }
    }

    const label =
        status === 'copied' ? 'Link copied' : status === 'shared' ? 'Shared' : 'Share';

    return (
        <button
            type="button"
            onClick={onClick}
            title={url}
            aria-label={`${label} — ${url}`}
            className="inline-flex items-center gap-1.5 rounded border border-border-base bg-bg px-2 py-1 text-xs text-fg/80 hover:bg-fg/5"
        >
            <span aria-hidden>↗</span>
            {label}
            <span className="text-muted">·</span>
            <span className="font-mono text-muted">{shortCode}</span>
        </button>
    );
}
