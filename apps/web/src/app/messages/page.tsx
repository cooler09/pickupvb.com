import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import type { InboxItem } from '@pickupvb/domain';
import { getCurrentUser } from '@/lib/server-auth';
import { getChatHandlers } from '@/lib/handlers';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';

const PER_PAGE = 20;

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

/** First token of a display name — keeps room previews short ("Alex: …"). */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

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

/** Default display zone for server-rendered times — this is a Virginia Beach
 * community, so ET is the right default (mirrors the notifications templates
 * `DEFAULT_TIME_ZONE`). Without it `toLocaleDateString` formats in the Node
 * runtime's zone (UTC on Vercel), pushing a late-evening message to the next
 * day's date in the inbox. */
const DEFAULT_TIME_ZONE = 'America/New_York';

/** Server-rendered absolute timestamp (pure — depends only on the ISO string,
 * so no `Date.now()` in render). The thread view renders live local times. */
function stamp(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: DEFAULT_TIME_ZONE,
  });
}

export default async function MessagesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await getCurrentUser();
  if (!user) redirect('/login?next=/messages');

  const rawSearchParams = await props.searchParams;
  const searchParams: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(rawSearchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);

  const { listInbox } = await getChatHandlers();
  const items = await listInbox.execute();
  // Slice for display; counts/empty-state read the full set (pattern #12).
  const pageItems = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <header className="space-y-1">
        <h1 className="text-headline-sm font-bold">Messages</h1>
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
          {pageItems.map((item) => {
            const href = inboxHref(item);
            const title = item.title ?? KIND_LABEL[item.kind];
            // Prefix room previews with who spoke so a busy team/event/group
            // thread shows "Alex: …", not a bare body (audit MU-4). DMs don't
            // need it — the title is the person; the viewer's own line is "You:".
            const preview =
              item.preview === null
                ? 'No messages yet'
                : item.previewSenderId === user.id
                  ? `You: ${item.preview}`
                  : item.kind !== 'dm' && item.previewSenderName
                    ? `${firstName(item.previewSenderName)}: ${item.preview}`
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
              'border-border-base bg-md-surface-container flex items-start justify-between gap-3 rounded-shape-sm border p-3';
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

      <Pagination
        basePath="/messages"
        page={page}
        pageSize={PER_PAGE}
        total={items.length}
        searchParams={searchParams}
      />
    </div>
  );
}
