'use client';

import { useEffect, useState } from 'react';

/**
 * Compact share widget for the canonical short URL of an event. Renders
 * the absolute URL on the client (using `window.location.origin`) so it
 * works correctly across local dev, preview deploys, and production
 * without baking the host name into the server build.
 *
 * SSR shows a path-only fallback (`/e/ABC23XYZ`) so the link is still
 * useful before hydration and for crawlers without JS.
 */
export function EventShareLink({ shortCode }: { shortCode: string }) {
    const [origin, setOrigin] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setOrigin(window.location.origin);
        }
    }, []);

    const path = `/e/${shortCode}`;
    const display = origin ? `${origin}${path}` : path;

    async function copy() {
        try {
            await navigator.clipboard.writeText(display);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard API can fail (e.g. insecure origin); silently ignore —
            // the URL is still selectable in the input.
        }
    }

    return (
        <div className="flex items-center gap-2">
            <input
                readOnly
                value={display}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 truncate rounded border border-border-base bg-bg px-2 py-1 font-mono text-xs text-fg/80"
                aria-label="Shareable event link"
            />
            <button
                type="button"
                onClick={copy}
                className="rounded border border-border-base bg-bg px-2 py-1 text-xs text-fg/80 hover:bg-fg/5"
            >
                {copied ? 'Copied' : 'Copy'}
            </button>
        </div>
    );
}
