'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { subscribeToNotifications, type NotificationRow } from '@/lib/subscribe-notifications';

type Props = {
  userId: string;
  initialUnreadCount: number;
  initialItems: NotificationRow[];
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Site-header notification bell. Subscribes to Realtime INSERTs on
 * `notifications` filtered to the current user, increments the badge,
 * and prepends new rows into the popover list.
 *
 * Popover opens on click; clicking outside or hitting Escape closes it.
 * Marking-all-read happens on open (write to `read_at = now()` for unread
 * rows in the current view).
 */
export function NotificationBell({ userId, initialUnreadCount, initialItems }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>(initialItems);
  const [unread, setUnread] = useState(initialUnreadCount);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // New notifications stream in over the shared private Broadcast channel
  // (ADR 0027: `notifications:<userId>`). The channel is owned by
  // `subscribeToNotifications` so the bell and the live Messages badge share one
  // socket join (the RLS topic is fixed, so a second join would be rejected).
  // Prepend the row and bump the badge — setState in a subscription callback is
  // the sanctioned external-store pattern, not a mount-time effect write.
  useEffect(
    () =>
      subscribeToNotifications(userId, (row) => {
        setItems((prev) => [row, ...prev].slice(0, 20));
        setUnread((u) => u + 1);
      }),
    [userId],
  );

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Mark unread items read when the popover opens.
  useEffect(() => {
    if (!open || unread === 0) return;
    const supabase = createSupabaseBrowserClient();
    const unreadIds = items.filter((i) => !i.read_at).map((i) => i.id);
    if (unreadIds.length === 0) return;
    void supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds)
      .then(() => {
        setUnread(0);
        setItems((prev) =>
          prev.map((p) => (p.read_at ? p : { ...p, read_at: new Date().toISOString() })),
        );
      });
  }, [open, unread, items]);

  const badge = useMemo(() => (unread > 99 ? '99+' : String(unread)), [unread]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        className="tap-target text-fg/70 hover:bg-fg/5 hover:text-primary focus-visible:ring-primary relative rounded-md transition-colors focus:outline-none focus-visible:ring-2"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="bg-primary ring-surface text-primary-fg absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold ring-2">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="border-border-base bg-surface rounded-shape-sm absolute right-0 z-50 mt-2 w-80 overflow-hidden border shadow-lg"
        >
          <div className="border-border-base flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <Link
              href={'/profile/notifications' as Route}
              className="text-primary text-xs hover:underline"
              onClick={() => setOpen(false)}
            >
              Settings
            </Link>
          </div>
          {items.length === 0 ? (
            <p className="text-muted px-3 py-6 text-center text-sm">You&apos;re all caught up.</p>
          ) : (
            <ul className="divide-border-base max-h-96 divide-y overflow-y-auto">
              {items.map((n) => {
                const inner = (
                  <div className="hover:bg-fg/5 px-3 py-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-muted mt-0.5 line-clamp-2 text-xs">{n.body}</p>}
                    <p className="text-muted mt-1 text-[10px] tracking-wide uppercase">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link href={n.href as Route} onClick={() => setOpen(false)} className="block">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
