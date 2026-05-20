'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  /** Absolute or origin-relative path (e.g. `/e/ABC23XYZ`, `/groups/42`). */
  path: string;
  /** Page title — used by the native share sheet and as accessible context. */
  title?: string;
  /** Short verbal code (e.g. event short code) to surface as a copyable chip. */
  code?: string;
  /** Button label (default: "Share"). */
  label?: string;
};

/**
 * Share control. Renders a small "Share" button that opens a popover with:
 *
 *   • the canonical URL (always visible, easy to read aloud)
 *   • a "Copy link" primary action with success feedback
 *   • a "Share…" button that invokes the native sheet on mobile/PWA
 *   • quick links to SMS, WhatsApp, X, and email
 *
 * The popover uses `<details>` for built-in open/close state and outside-click
 * handling — no portal or focus-trap library required.
 */
export function ShareLink({ path, title, code, label = 'Share' }: Props) {
  const [origin, setOrigin] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [status, setStatus] = useState<'idle' | 'copied' | 'shared'>('idle');
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOrigin(window.location.origin);
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  // Close the popover when the user clicks anywhere outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = detailsRef.current;
      if (!el || !el.open) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        el.open = false;
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const url = origin ? `${origin}${path}` : path;
  const shareText = title ? `${title} — ${url}` : url;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 1800);
    } catch {
      /* clipboard unavailable on insecure origins */
    }
  }

  async function nativeShare() {
    if (!canShare) return copy();
    try {
      await navigator.share({ url, ...(title ? { title, text: title } : {}) });
      setStatus('shared');
      setTimeout(() => setStatus('idle'), 1800);
    } catch {
      /* user dismissed — leave status alone */
    }
  }

  const smsHref = `sms:?body=${encodeURIComponent(shareText)}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(title ?? 'Check this out')}&body=${encodeURIComponent(shareText)}`;
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title ?? '')}&url=${encodeURIComponent(url)}`;

  return (
    <details ref={detailsRef} className="group relative inline-block">
      <summary
        className="border-border-base bg-bg hover:bg-fg/5 text-fg inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium select-none [&::-webkit-details-marker]:hidden"
        aria-label={`Share — ${url}`}
      >
        <ShareIcon />
        {label}
        {code && (
          <span className="text-muted ml-0.5 font-mono text-xs">{code}</span>
        )}
      </summary>

      <div
        role="dialog"
        aria-label="Share this page"
        className="border-border-base bg-surface absolute right-0 z-30 mt-2 w-72 space-y-3 rounded-lg border p-3 shadow-lg"
      >
        <div>
          <label className="text-muted mb-1 block text-[10px] font-semibold tracking-wide uppercase">
            Link
          </label>
          <div className="flex items-stretch gap-1.5">
            <input
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="border-border-base bg-bg text-fg focus:border-primary min-w-0 flex-1 rounded-md border px-2 py-1.5 font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={copy}
              className="bg-primary text-primary-fg shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold hover:opacity-90"
            >
              {status === 'copied' ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <span className="sr-only" aria-live="polite">
            {status === 'copied' ? 'Link copied to clipboard.' : ''}
          </span>
        </div>

        {canShare && (
          <button
            type="button"
            onClick={nativeShare}
            className="border-border-base hover:bg-fg/5 text-fg flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            <ShareIcon /> Share via system…
          </button>
        )}

        <div>
          <p className="text-muted mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
            Quick share
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            <QuickShareButton href={smsHref} label="SMS" />
            <QuickShareButton href={waHref} label="WhatsApp" external />
            <QuickShareButton href={xHref} label="X" external />
            <QuickShareButton href={mailHref} label="Email" />
          </div>
        </div>
      </div>
    </details>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="h-3.5 w-3.5"
    >
      <circle cx="5" cy="10" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="15" cy="15" r="2" />
      <path d="M7 9l6-3M7 11l6 3" />
    </svg>
  );
}

function QuickShareButton({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="border-border-base hover:bg-fg/5 text-fg/80 flex items-center justify-center rounded-md border px-2 py-1.5 text-xs font-medium"
    >
      {label}
    </a>
  );
}
