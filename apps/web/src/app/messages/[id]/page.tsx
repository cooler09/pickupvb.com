import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { UserId } from '@pickupvb/domain';
import { ListMessagesQuery, MarkConversationReadCommand } from '@pickupvb/application';
import { SupabaseProfileRepository, SupabaseUserBlockRepository } from '@pickupvb/infrastructure';
import { getCurrentUser } from '@/lib/server-auth';
import { getChatHandlers } from '@/lib/handlers';
import { ConversationView } from '@/components/conversation-view';
import { BlockControl } from './_components/block-control';

export const metadata = {
  title: 'Messages — PickupVB',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 30;

type ConversationRow = { id: string; kind: 'team' | 'event' | 'group' | 'dm' };

export default async function ConversationPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, user } = await getCurrentUser();
  if (!user) redirect(`/login?next=/messages/${id}`);

  // RLS returns the row only if the viewer can access it — otherwise 404.
  const { data: convData } = await supabase
    .from('conversations')
    .select('id, kind')
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
    otherCard?.displayName ?? (conv.kind === 'dm' ? 'Direct message' : 'Conversation');

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-4">
      <header className="space-y-1">
        <Link href="/messages" className="text-primary text-sm hover:underline">
          ← Messages
        </Link>
        <div className="flex items-center justify-between gap-3">
          {otherCard ? (
            <Link
              href={`/players/${otherCard.handle}` as Route}
              className="truncate text-xl font-bold hover:underline"
            >
              {heading}
            </Link>
          ) : (
            <h1 className="truncate text-xl font-bold">{heading}</h1>
          )}
          {conv.kind === 'dm' && otherCard && (
            <BlockControl otherUserId={otherCard.id} initiallyBlocked={initiallyBlocked} />
          )}
        </div>
      </header>

      <ConversationView
        conversationId={id}
        viewerId={user.id}
        initialMessages={page.messages}
        initialHasMore={page.hasMore}
        initialNextBefore={page.nextBefore}
        participants={participants}
      />
    </div>
  );
}
