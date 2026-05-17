'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

type NotificationRow = {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    href: string | null;
    read_at: string | null;
    created_at: string;
};

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

    // Realtime subscription — new notifications stream in.
    useEffect(() => {
        const supabase = createSupabaseBrowserClient();
        // Unique topic per mount: under React strict mode the effect runs
        // twice and `removeChannel` is async, so reusing a fixed topic
        // (`notifications:<userId>`) returns the already-subscribed instance
        // on the second mount and `.on(...)` throws
        // "cannot add `postgres_changes` callbacks ... after `subscribe()`".
        const topic = `notifications:${userId}:${Math.random().toString(36).slice(2, 10)}`;
        const channel = supabase
            .channel(topic)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const row = payload.new as NotificationRow;
                    setItems((prev) => [row, ...prev].slice(0, 20));
                    setUnread((u) => u + 1);
                },
            )
            .subscribe();
        return () => {
            void supabase.removeChannel(channel);
        };
    }, [userId]);

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
            .update({ read_at: new Date().toISOString() } as never)
            .in('id', unreadIds)
            .then(() => {
                setUnread(0);
                setItems((prev) =>
                    prev.map((p) =>
                        p.read_at ? p : { ...p, read_at: new Date().toISOString() },
                    ),
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
                className="relative flex h-11 w-11 items-center justify-center rounded-md text-fg/70 transition-colors hover:bg-fg/5 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-surface">
                        {badge}
                    </span>
                )}
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Notifications"
                    className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border-base bg-surface shadow-lg"
                >
                    <div className="flex items-center justify-between border-b border-border-base px-3 py-2">
                        <span className="text-sm font-semibold">Notifications</span>
                        <Link
                            href={'/profile/notifications' as Route}
                            className="text-xs text-primary hover:underline"
                            onClick={() => setOpen(false)}
                        >
                            Settings
                        </Link>
                    </div>
                    {items.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-muted">
                            You&apos;re all caught up.
                        </p>
                    ) : (
                        <ul className="max-h-96 divide-y divide-border-base overflow-y-auto">
                            {items.map((n) => {
                                const inner = (
                                    <div className="px-3 py-2 hover:bg-fg/5">
                                        <p className="text-sm font-medium">{n.title}</p>
                                        {n.body && (
                                            <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                                                {n.body}
                                            </p>
                                        )}
                                        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                                            {timeAgo(n.created_at)}
                                        </p>
                                    </div>
                                );
                                return (
                                    <li key={n.id}>
                                        {n.href ? (
                                            <Link
                                                href={n.href as Route}
                                                onClick={() => setOpen(false)}
                                                className="block"
                                            >
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
