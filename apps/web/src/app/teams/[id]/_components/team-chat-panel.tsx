'use client';

import { useEffect, useState } from 'react';
import type { MessagePage } from '@pickupvb/domain';
import { ConversationView } from '@/components/conversation-view';
import { openTeamChat } from '@/app/_actions/chat-actions';

type Props = {
  teamId: string;
  /** Roster name lookup — Realtime broadcast rows carry only `sender_id`, so
   *  live messages resolve their author from here. */
  participants: { id: string; name: string }[];
};

type State =
  | { status: 'loading' }
  | { status: 'hidden' } // anon or non-member — render nothing
  | { status: 'ready'; conversationId: string; viewerId: string; page: MessagePage };

/**
 * Live team chat (ADR 0028, Phase 1). A client island mounted on the ISR-cached
 * `/teams/[id]` page — it bootstraps its own state after hydration, so the page
 * never calls `cookies()` for anonymous visitors.
 *
 * Renders nothing for anonymous viewers or non-members (the get-or-create RPC
 * rejects non-members via RLS → `'forbidden'`). For members it opens the room,
 * loads the most recent page, and hands off to the shared {@link ConversationView}.
 */
export function TeamChatPanel({ teamId, participants }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await openTeamChat(teamId);
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
  }, [teamId]);

  if (state.status === 'hidden') return null;

  return (
    <section className="space-y-2" aria-label="Team chat">
      <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">Team chat</h2>
      {state.status === 'loading' ? (
        <div className="border-border-base bg-surface rounded-shape-sm text-muted flex min-h-48 items-center justify-center border p-3 text-sm">
          Loading messages…
        </div>
      ) : (
        <ConversationView
          conversationId={state.conversationId}
          viewerId={state.viewerId}
          kind="team"
          initialMessages={state.page.messages}
          initialHasMore={state.page.hasMore}
          initialNextBefore={state.page.nextBefore}
          participants={participants}
        />
      )}
    </section>
  );
}
