'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { neutralButtonClass } from '@/components/primary-button';
import { useIsMounted } from '@/lib/use-is-mounted';

/**
 * One row in the host "Displays" hub (tournament-displays slice D): a scannable
 * QR + the absolute URL + copy / open actions for a single kiosk display link.
 *
 * Client component because both the QR and the copy action need the absolute
 * URL, which only exists in the browser (`window.location.origin`) — the same
 * origin-after-mount pattern `ShareLink` uses. Before hydration we render a
 * placeholder box (no QR) so SSR and the first client render agree.
 */
export function DisplayLinkRow({ title, path }: { title: string; path: string }) {
  const mounted = useIsMounted();
  const origin = mounted ? window.location.origin : null;
  const url = origin ? `${origin}${path}` : path;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable on insecure origins */
    }
  }

  return (
    <div className="border-border-base bg-bg rounded-shape-sm flex items-center gap-3 border p-3">
      <div className="shrink-0 rounded-md bg-white p-2">
        {mounted ? (
          <QRCodeSVG value={url} size={88} marginSize={2} />
        ) : (
          <div className="h-[88px] w-[88px]" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-fg truncate text-sm font-medium">{title}</p>
        <p className="text-muted font-mono text-[11px] break-all">{url}</p>
        <div className="flex flex-wrap gap-2 pt-0.5">
          <button type="button" onClick={copy} className={neutralButtonClass('sm')}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
          <a
            href={path}
            target="_blank"
            rel="noopener noreferrer"
            className={neutralButtonClass('sm')}
          >
            {'Open ↗'}
          </a>
        </div>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Link copied to clipboard.' : ''}
        </span>
      </div>
    </div>
  );
}
