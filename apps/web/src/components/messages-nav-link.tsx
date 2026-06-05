import Link from 'next/link';

/**
 * Site-header "Messages" link with an unread-conversation badge (ADR 0028,
 * Phase 2). Server-rendered count from `count_unread_conversations` — the badge
 * reflects the last page load, not live (live updates are a follow-up, same
 * staged approach the notification bell took before ADR 0027). Styled to match
 * the {@link NotificationBell} icon button.
 */
export function MessagesNavLink({ unread }: { unread: number }) {
  const badge = unread > 99 ? '99+' : String(unread);
  return (
    <Link
      href="/messages"
      aria-label={`Messages${unread > 0 ? ` (${unread} unread)` : ''}`}
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
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
      {unread > 0 && (
        <span className="bg-primary ring-surface text-primary-fg absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold ring-2">
          {badge}
        </span>
      )}
    </Link>
  );
}
