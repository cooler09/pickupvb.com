import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import type { InboxItem } from '@pickupvb/domain';
import { getCurrentUser } from '@/lib/server-auth';
import { getChatHandlers } from '@/lib/handlers';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { InboxLiveRefresh } from './_components/inbox-live-refresh';

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

/** Every conversation — room or DM — opens its focused thread at
 * `/messages/{id}`, the same target the chat notification deep-links to, so the
 * inbox and the bell agree (audit MU-12). Opening it advances the read cursor;
 * the thread page links back out to the team / event / group context (audit
 * MU-1). Previously rooms routed to their context page, dropping the reader at
 * the top of a long page with the chat panel buried. */
function inboxHref(item: InboxItem): Route {
  return `/messages/${item.conversationId}` as Route;
}

/** Default display zone for server-rendered times — this is a Virginia Beach
 * community, so ET is the right default (mirrors the notifications templates
 * `DEFAULT_TIME_ZONE`). Without it `toLocaleDateString` formats in the Node
 * runtime's zone (UTC on Vercel), pushing a late-evening message to the next
 * day's date in the inbox. */
const DEFAULT_TIME_ZONE = 'America/New_York';

/** Calendar-day ordinal (days since epoch) for a date in the inbox's ET zone —
 * lets `stamp` compare days without time-of-day noise (mirrors `dayOrdinal` in
 * date-formats.ts). */
function etDayOrdinal(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const val = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Math.floor(Date.UTC(val('year'), val('month') - 1, val('day')) / 86_400_000);
}

/** Inbox timestamp, recency-aware so today's threads aren't all a date with no
 * time (audit MU-9): today → time ("3:42 PM"), within a week → weekday ("Mon"),
 * older → "Jun 7". `now` is passed from the page boundary so this stays pure (no
 * `Date.now()` in render, per the React Compiler purity rule). The thread view
 * renders live local times. */
function stamp(iso: string | null, now: Date): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = etDayOrdinal(now) - etDayOrdinal(d);
  if (diff <= 0) {
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: DEFAULT_TIME_ZONE,
    });
  }
  if (diff < 7) {
    return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: DEFAULT_TIME_ZONE });
  }
  return d.toLocaleDateString('en-US', {
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
  // Live request time, passed into the pure `stamp` so the relative label is
  // computed without a `Date.now()` in render (audit MU-9 / React Compiler).
  const now = new Date();

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      {/* Re-renders the server list (previews, unread dots, order) when a chat
          message arrives, so the inbox isn't stale until navigation (MU-15). */}
      <InboxLiveRefresh userId={user.id} />
      <header className="space-y-1">
        <h1 className="text-headline-sm font-bold">Messages</h1>
        <p className="text-muted text-sm">
          Your direct messages and team, event, and group conversations.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Your direct messages and team, event, and group chats show up here."
          primary={{ href: '/events', label: 'Find events' }}
          unlocks="Join an event or team to start chatting with other players."
        />
      ) : (
        <ul className="space-y-2">
          {pageItems.map((item) => {
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
                <span className="text-muted shrink-0 text-xs">
                  {stamp(item.lastMessageAt, now)}
                </span>
              </>
            );
            return (
              <li key={item.conversationId}>
                <Link
                  href={inboxHref(item)}
                  className="border-border-base bg-md-surface-container hover:border-primary/40 rounded-shape-sm flex items-start justify-between gap-3 border p-3 transition-colors"
                >
                  {inner}
                </Link>
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
