'use client';

import { useEffect, useState } from 'react';
import type { MessagePage, RoomKind } from '@pickupvb/domain';
import { ConversationView } from '@/components/conversation-view';
import { openRoomChat } from '@/app/_actions/chat-actions';

type Props = {
  /** Which context room — `team` / `event` / `group`. Drives the get-or-create
   *  RPC and the (mask) moderation policy. */
  kind: RoomKind;
  /** The source entity id (team / event / group UUID). */
  contextId: string;
  /** Section heading, e.g. "Team chat" / "Event chat" / "Group chat". */
  label: string;
  /** Roster name lookup — Realtime broadcast rows carry only `sender_id`, so
   *  live messages resolve their author from here. Best-effort; the initial page
   *  already carries server-resolved names. */
  participants: { id: string; name: string }[];
};

type State =
  | { status: 'loading' }
  | { status: 'hidden' } // anon or non-member — render nothing
  | { status: 'ready'; conversationId: string; viewerId: string; page: MessagePage };

/**
 * Live context-room chat (ADR 0028). A client island mounted on a context page
 * (the ISR-cached `/teams/[id]` and `/groups/[id]`, or the per-viewer
 * `/events/[id]`) — it bootstraps its own state after hydration, so an ISR page
 * never calls `cookies()` for anonymous visitors.
 *
 * Renders nothing for anonymous viewers or non-members (the get-or-create RPC
 * rejects non-members via RLS → `'forbidden'`). For members it opens the room,
 * loads the most recent page, and hands off to the shared {@link ConversationView}.
 * Generalizes the original team-only panel to all three room kinds.
 */
export function RoomChatPanel({ kind, contextId, label, participants }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await openRoomChat(kind, contextId);
      if (cancelled) return;
      if (!res.ok) {
        setState({ status: 'hidden' });
        return;
      }
      setState({
        status: 'ready',
        conversationId: res.value.conversationId,
        viewerId: res.value.viewerId,
        page: res.value.page,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, contextId]);

  if (state.status === 'hidden') return null;

  return (
    <section className="space-y-2" aria-label={label}>
      <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">{label}</h2>
      {state.status === 'loading' ? (
        <div className="border-border-base bg-md-surface-container rounded-shape-sm text-muted flex min-h-48 items-center justify-center border p-3 text-sm">
          Loading messages…
        </div>
      ) : (
        <ConversationView
          conversationId={state.conversationId}
          viewerId={state.viewerId}
          kind={kind}
          initialMessages={state.page.messages}
          initialHasMore={state.page.hasMore}
          initialNextBefore={state.page.nextBefore}
          participants={participants}
        />
      )}
    </section>
  );
}
