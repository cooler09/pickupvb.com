import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { UserId } from '@pickupvb/domain';
import { ListMessagesQuery, MarkConversationReadCommand } from '@pickupvb/application';
import { SupabaseProfileRepository, SupabaseUserBlockRepository } from '@pickupvb/infrastructure';
import { getCurrentUser } from '@/lib/server-auth';
import { getChatHandlers } from '@/lib/handlers';
import { ConversationView } from '@/components/conversation-view';
import { DmThread } from './_components/dm-thread';

export const metadata = {
  title: 'Messages — PickupVB',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

/** Viewport-relative list height for the full-page thread, so it isn't a tiny
 * box in an empty column like the embedded context-page panels (audit MU-2). */
const THREAD_LIST_HEIGHT = 'max-h-[65vh] min-h-[20rem]';

/** Orientation sub-label under a room thread's title (audit MU-1). */
const ROOM_KIND_LABEL: Record<'team' | 'event' | 'group', string> = {
  team: 'Team chat',
  event: 'Event chat',
  group: 'Group chat',
};

type ConversationRow = {
  id: string;
  kind: 'team' | 'event' | 'group' | 'dm';
  context_id: string | null;
};

export default async function ConversationPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, user } = await getCurrentUser();
  if (!user) redirect(`/login?next=/messages/${id}`);

  // RLS returns the row only if the viewer can access it — otherwise 404.
  const { data: convData } = await supabase
    .from('conversations')
    .select('id, kind, context_id')
    .eq('id', id)
    .maybeSingle();
  const conv = convData as ConversationRow | null;
  if (!conv) notFound();

  // Resolve the DM counterpart (header + live-message name map).
  let otherId: string | null = null;
  if (conv.kind === 'dm') {
    const { data: partData } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', id)
      .neq('user_id', user.id);
    otherId = (partData as { user_id: string }[] | null)?.[0]?.user_id ?? null;
  }

  const profiles = new SupabaseProfileRepository(supabase);
  const cards = await profiles.findCardsByIds([user.id, ...(otherId ? [otherId] : [])]);
  const viewerName = cards.get(user.id)?.displayName ?? 'You';
  const otherCard = otherId ? (cards.get(otherId) ?? null) : null;

  // Resolve a room's title + a link back to its context (team / group / event).
  // A room thread opened directly — the chat notification deep-links rooms to
  // `/messages/{id}`, not the context page — otherwise renders the generic
  // heading "Conversation" with no name and no way back (audit MU-1).
  let roomTitle: string | null = null;
  let roomHref: Route | null = null;
  if (conv.kind !== 'dm' && conv.context_id) {
    if (conv.kind === 'team') {
      const { data } = await supabase
        .from('teams')
        .select('name, slug')
        .eq('id', conv.context_id)
        .maybeSingle();
      const row = data as { name: string; slug: string } | null;
      roomTitle = row?.name ?? null;
      roomHref = row?.slug ? (`/teams/${row.slug}` as Route) : null;
    } else if (conv.kind === 'group') {
      const { data } = await supabase
        .from('groups')
        .select('name, slug')
        .eq('id', conv.context_id)
        .maybeSingle();
      const row = data as { name: string; slug: string } | null;
      roomTitle = row?.name ?? null;
      roomHref = row?.slug ? (`/groups/${row.slug}` as Route) : null;
    } else {
      const { data } = await supabase
        .from('events')
        .select('title')
        .eq('id', conv.context_id)
        .maybeSingle();
      const row = data as { title: string } | null;
      roomTitle = row?.title ?? null;
      roomHref = `/events/${conv.context_id}` as Route;
    }
  }

  const { listMessages, markConversationRead } = await getChatHandlers();
  const page = await listMessages.execute(new ListMessagesQuery(id, PAGE_SIZE));
  await markConversationRead.execute(new MarkConversationReadCommand(id, user.id));

  const initiallyBlocked = otherCard
    ? await new SupabaseUserBlockRepository(supabase).hasBlocked(
        UserId(user.id),
        UserId(otherCard.id),
      )
    : false;

  const participants = [
    { id: user.id, name: viewerName },
    ...(otherCard ? [{ id: otherCard.id, name: otherCard.displayName }] : []),
  ];
  const heading =
    otherCard?.displayName ?? roomTitle ?? (conv.kind === 'dm' ? 'Direct message' : 'Conversation');

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-4">
      <Link href="/messages" className="text-primary text-sm hover:underline">
        ← Messages
      </Link>

      {conv.kind === 'dm' && otherCard ? (
        // DM with a live counterpart: the title row's block toggle and the
        // composer share one `blocked` state (audit M-9).
        <DmThread
          conversationId={id}
          viewerId={user.id}
          heading={heading}
          otherUserId={otherCard.id}
          otherHandle={otherCard.handle}
          initiallyBlocked={initiallyBlocked}
          participants={participants}
          initialMessages={page.messages}
          initialHasMore={page.hasMore}
          initialNextBefore={page.nextBefore}
          listHeightClass={THREAD_LIST_HEIGHT}
        />
      ) : (
        // Room conversation, or a DM whose counterpart was deleted — no block
        // relationship to manage.
        <>
          <div className="space-y-0.5">
            {roomHref ? (
              <Link
                href={roomHref}
                className="text-title-lg block truncate font-bold hover:underline"
              >
                {heading}
              </Link>
            ) : (
              <h1 className="text-title-lg truncate font-bold">{heading}</h1>
            )}
            {conv.kind !== 'dm' && (
              <p className="text-muted text-xs">{ROOM_KIND_LABEL[conv.kind]}</p>
            )}
          </div>
          <ConversationView
            conversationId={id}
            viewerId={user.id}
            kind={conv.kind}
            initialMessages={page.messages}
            initialHasMore={page.hasMore}
            initialNextBefore={page.nextBefore}
            participants={participants}
            listHeightClass={THREAD_LIST_HEIGHT}
          />
        </>
      )}
    </div>
  );
}
