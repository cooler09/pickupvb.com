import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import type { InboxItem } from '@pickupvb/domain';
import { getCurrentUser } from '@/lib/server-auth';
import { getChatHandlers } from '@/lib/handlers';
import { EmptyState } from '@/components/empty-state';

export const metadata = {
  title: 'Messages — PickupVB',
  robots: { index: false, follow: false },
};

const KIND_LABEL: Record<InboxItem['kind'], string> = {
  team: 'Team',
  event: 'Event',
  group: 'Group',
  dm: 'Direct message',
};

/** Where a conversation row links to. Rooms open on the context page that hosts
 * their chat (team / event / group); DMs open the dedicated thread at
 * `/messages/{id}`. Opening either advances the read cursor. Template literals
 * keep `typedRoutes` happy. */
function inboxHref(item: InboxItem): Route | null {
  switch (item.kind) {
    case 'team':
      return item.contextSlug ? (`/teams/${item.contextSlug}` as Route) : null;
    case 'group':
      return item.contextSlug ? (`/groups/${item.contextSlug}` as Route) : null;
    case 'event':
      return item.contextId ? (`/events/${item.contextId}` as Route) : null;
    case 'dm':
      return `/messages/${item.conversationId}` as Route;
  }
}

/** Server-rendered absolute timestamp (pure — depends only on the ISO string,
 * so no `Date.now()` in render). The thread view renders live local times. */
function stamp(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default async function MessagesPage() {
  const { user } = await getCurrentUser();
  if (!user) redirect('/login?next=/messages');

  const { listInbox } = await getChatHandlers();
  const items = await listInbox.execute();

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-muted text-sm">Your team, event, and group conversations.</p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Your team, event, and group chats show up here."
          primary={{ href: '/events', label: 'Find events' }}
          unlocks="Join an event or team to start chatting with other players."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const href = inboxHref(item);
            const title = item.title ?? KIND_LABEL[item.kind];
            const preview =
              item.preview === null
                ? 'No messages yet'
                : item.previewSenderId === user.id
                  ? `You: ${item.preview}`
                  : item.preview;
            const inner = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {item.isUnread && (
                      <span
                        aria-label="Unread"
                        className="bg-primary inline-block h-2 w-2 shrink-0 rounded-full"
                      />
                    )}
                    <span
                      className={`truncate text-sm ${item.isUnread ? 'font-semibold' : 'font-medium'}`}
                    >
                      {title}
                    </span>
                    <span className="text-muted shrink-0 text-xs">{KIND_LABEL[item.kind]}</span>
                  </div>
                  <p className="text-muted mt-0.5 truncate text-sm">{preview}</p>
                </div>
                <span className="text-muted shrink-0 text-xs">{stamp(item.lastMessageAt)}</span>
              </>
            );
            const className =
              'border-border-base bg-surface flex items-start justify-between gap-3 rounded-shape-sm border p-3';
            return (
              <li key={item.conversationId}>
                {href ? (
                  <Link
                    href={href}
                    className={`${className} hover:border-primary/40 transition-colors`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={className}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
