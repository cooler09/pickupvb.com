'use client';

import { useEffect, useState } from 'react';

/**
 * Compact share control. Uses the Web Share API on supported devices
 * (native mobile sheet) and falls back to clipboard on desktop. Pass an
 * absolute or origin-relative `path` (e.g. `/e/ABC23XYZ`, `/groups/42`).
 * The full URL is exposed via `title`/`aria-label` for hover & a11y.
 *
 * Optional `label` is shown after the icon when there's no `code`; for
 * shareable short codes (events), pass `code` to render `· CODE` as a
 * verbal/readable identifier.
 */
export function ShareLink({
    path,
    title,
    code,
    label = 'Share',
}: {
    path: string;
    title?: string;
    code?: string;
    label?: string;
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

    const text = status === 'copied' ? 'Link copied' : status === 'shared' ? 'Shared' : label;

    return (
        <button
            type="button"
            onClick={onClick}
            title={url}
            aria-label={`${text} — ${url}`}
            className="inline-flex items-center gap-1.5 rounded border border-border-base bg-bg px-2 py-1 text-xs text-fg/80 hover:bg-fg/5"
        >
            <span aria-hidden>↗</span>
            {text}
            {code ? (
                <>
                    <span className="text-muted">·</span>
                    <span className="font-mono text-muted">{code}</span>
                </>
            ) : null}
        </button>
    );
}
