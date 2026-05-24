'use client';

import { useState, type ReactNode } from 'react';

type Props = {
  /** Server action (or any async fn) that resolves to the destination URL. */
  getUrl: () => Promise<string | null>;
  children: ReactNode;
  className?: string;
  /** Optional message shown via `alert` when `getUrl` returns null. */
  nullMessage?: string;
};

/**
 * Button that opens the result of a server action in a new tab.
 *
 * Server Actions submit via fetch, so `<form target="_blank">` is ignored.
 * Instead we open a placeholder window synchronously on click (to satisfy
 * popup blockers) and navigate it once the action resolves the real URL.
 */
export function OpenInNewTabButton({ getUrl, children, className, nullMessage }: Props) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        if (pending) return;
        // Open placeholder synchronously so the browser treats it as a user gesture.
        // NOTE: passing `noopener` makes window.open return null in most browsers,
        // which would silently break the new-tab navigation. Omit it here; the
        // destinations are first-party-controlled Stripe URLs.
        const win = window.open('about:blank', '_blank');
        setPending(true);
        getUrl()
          .then((url) => {
            if (!url) {
              if (win) win.close();
              if (nullMessage) alert(nullMessage);
              return;
            }
            if (win) {
              win.location.href = url;
            } else {
              // Popup blocked — fall back to same-tab navigation.
              window.location.href = url;
            }
          })
          .catch((err: unknown) => {
            if (win) win.close();
            const msg = err instanceof Error ? err.message : 'Something went wrong.';
            alert(msg);
          })
          .finally(() => setPending(false));
      }}
    >
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </button>
  );
}
