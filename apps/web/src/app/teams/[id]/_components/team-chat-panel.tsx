'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { MessageView } from '@pickupvb/domain';
import { primaryButtonClass, textButtonClass } from '@/components/primary-button';
import { fieldInputClass } from '@/components/field-styles';
import {
  deleteChatMessage,
  editChatMessage,
  loadOlderChatMessages,
  openTeamChat,
  reportChatMessage,
  sendChatMessage,
} from '../chat-actions';

type Props = {
  teamId: string;
  /** Roster name lookup — Realtime broadcast rows carry only `sender_id`, so
   *  live messages resolve their author from here. */
  participants: { id: string; name: string }[];
};

type SenderCard = { name: string; avatar: string | null };

/** Raw `messages` row as delivered on the `chat:{id}` Broadcast topic. */
type BroadcastRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  deleted_at: string | null;
  edited_at: string | null;
  created_at: string;
};

type State =
  | { status: 'loading' }
  | { status: 'hidden' } // anon or non-member — render nothing
  | { status: 'ready'; conversationId: string; viewerId: string };

function mergeMessages(prev: MessageView[], incoming: MessageView[]): MessageView[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1,
  );
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
}

/**
 * Live team chat (ADR 0028, Phase 1). A client island mounted on the ISR-cached
 * `/teams/[id]` page — it bootstraps its own state after hydration, so the page
 * never calls `cookies()` for anonymous visitors.
 *
 * Renders nothing for anonymous viewers or non-members (the get-or-create RPC
 * rejects non-members via RLS → `'forbidden'`). For members it shows the most
 * recent page, a "load older" affordance, and a composer, then subscribes to
 * the private `chat:{conversationId}` Broadcast topic for live INSERT (new
 * messages) and UPDATE (edits / soft-delete tombstones) — the same private
 * Realtime pattern as the notification bell (ADR 0027).
 */
export function TeamChatPanel({ teamId, participants }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);

  // Sender card lookup, seeded from the roster and enriched (avatars) as
  // messages with embedded sender cards load.
  const senderCards = useRef<Map<string, SenderCard>>(
    new Map(participants.map((p) => [p.id, { name: p.name, avatar: null }])),
  );
  const learnSenders = useCallback((views: MessageView[]) => {
    for (const v of views) {
      const existing = senderCards.current.get(v.senderId);
      senderCards.current.set(v.senderId, {
        name: v.senderName ?? existing?.name ?? 'Member',
        avatar: v.senderAvatarUrl ?? existing?.avatar ?? null,
      });
    }
  }, []);
  const resolveSender = useCallback(
    (id: string): SenderCard => senderCards.current.get(id) ?? { name: 'Member', avatar: null },
    [],
  );

  const recordToView = useCallback(
    (rec: BroadcastRow): MessageView => {
      const deleted = rec.deleted_at !== null;
      const who = resolveSender(rec.sender_id);
      return {
        id: rec.id,
        conversationId: rec.conversation_id,
        senderId: rec.sender_id,
        senderName: who.name,
        senderAvatarUrl: who.avatar,
        body: deleted ? '' : rec.body,
        isDeleted: deleted,
        isEdited: rec.edited_at !== null,
        createdAt: rec.created_at,
      };
    },
    [resolveSender],
  );

  // ---- Bootstrap ----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await openTeamChat(teamId);
      if (cancelled) return;
      if (!res.ok) {
        setState({ status: 'hidden' });
        return;
      }
      learnSenders(res.value.page.messages);
      setMessages(res.value.page.messages);
      setHasMore(res.value.page.hasMore);
      setNextBefore(res.value.page.nextBefore);
      setState({
        status: 'ready',
        conversationId: res.value.conversationId,
        viewerId: res.value.viewerId,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, learnSenders]);

  // ---- Realtime subscription ---------------------------------------------
  const conversationId = state.status === 'ready' ? state.conversationId : null;
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createSupabaseBrowserClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      const onWrite = (msg: { payload: unknown }) => {
        const rec = (msg.payload as { record?: BroadcastRow }).record;
        if (!rec) return;
        const view = recordToView(rec);
        learnSenders([view]);
        setMessages((prev) => mergeMessages(prev, [view]));
      };

      channel = supabase
        .channel(`chat:${conversationId}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, onWrite)
        .on('broadcast', { event: 'UPDATE' }, onWrite)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, recordToView, learnSenders]);

  // ---- Auto-scroll to newest when already at the bottom -------------------
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const viewerId = state.status === 'ready' ? state.viewerId : null;

  const send = useCallback(async () => {
    if (!conversationId || !viewerId) return;
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    // Optimistic echo — the matching INSERT broadcast replaces this by id.
    const tempView: MessageView = {
      id: `temp-${Date.now()}`,
      conversationId,
      senderId: viewerId,
      senderName: resolveSender(viewerId).name,
      senderAvatarUrl: resolveSender(viewerId).avatar,
      body,
      isDeleted: false,
      isEdited: false,
      createdAt: new Date().toISOString(),
    };
    atBottomRef.current = true;
    setMessages((prev) => mergeMessages(prev, [tempView]));
    setDraft('');
    const res = await sendChatMessage(conversationId, body);
    setSending(false);
    if (!res.ok) {
      // Roll back the optimistic row and surface the reason.
      setMessages((prev) => prev.filter((m) => m.id !== tempView.id));
      setDraft(body);
      setError(
        res.error === 'forbidden'
          ? 'You are no longer a member of this team.'
          : res.error === 'invalid'
            ? 'Message could not be sent.'
            : 'Something went wrong. Try again.',
      );
      return;
    }
    // Reconcile the temp id to the real id so a slow broadcast cannot duplicate.
    setMessages((prev) =>
      prev.some((m) => m.id === res.value.id)
        ? prev.filter((m) => m.id !== tempView.id)
        : prev.map((m) => (m.id === tempView.id ? { ...m, id: res.value.id } : m)),
    );
  }, [conversationId, viewerId, draft, sending, resolveSender]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !nextBefore || loadingOlder) return;
    setLoadingOlder(true);
    const res = await loadOlderChatMessages(conversationId, nextBefore);
    setLoadingOlder(false);
    if (!res.ok) return;
    learnSenders(res.value.messages);
    atBottomRef.current = false;
    setMessages((prev) => mergeMessages(prev, res.value.messages));
    setHasMore(res.value.hasMore);
    setNextBefore(res.value.nextBefore);
  }, [conversationId, nextBefore, loadingOlder, learnSenders]);

  const saveEdit = useCallback(
    async (messageId: string) => {
      const body = editDraft.trim();
      if (!body) return;
      const res = await editChatMessage(messageId, body);
      if (res.ok) {
        // Optimistic — the UPDATE broadcast confirms.
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, body, isEdited: true } : m)),
        );
      }
      setEditingId(null);
      setEditDraft('');
    },
    [editDraft],
  );

  const remove = useCallback(async (messageId: string) => {
    if (!window.confirm('Delete this message?')) return;
    const res = await deleteChatMessage(messageId);
    if (res.ok) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isDeleted: true, body: '' } : m)),
      );
    }
  }, []);

  const report = useCallback(async (messageId: string) => {
    if (!window.confirm('Report this message to the team moderators?')) return;
    await reportChatMessage(messageId, null);
  }, []);

  const hidden = state.status === 'hidden';
  const loading = state.status === 'loading';
  const empty = useMemo(() => messages.filter((m) => !m.isDeleted).length === 0, [messages]);

  if (hidden) return null;

  return (
    <section className="space-y-2" aria-label="Team chat">
      <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">Team chat</h2>
      <div className="border-border-base bg-surface rounded-shape-sm flex flex-col overflow-hidden border">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="flex max-h-96 min-h-48 flex-col gap-3 overflow-y-auto p-3"
        >
          {loading ? (
            <p className="text-muted m-auto text-sm">Loading messages…</p>
          ) : (
            <>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                  className={`${textButtonClass('sm')} mx-auto`}
                >
                  {loadingOlder ? 'Loading…' : 'Load earlier messages'}
                </button>
              )}
              {empty && (
                <p className="text-muted m-auto text-sm">No messages yet — say hi to your team.</p>
              )}
              {messages.map((m) => {
                const mine = m.senderId === viewerId;
                // `senderName` is resolved when the view is built (load / broadcast),
                // so render stays pure — never read the sender-card ref here.
                const displayName = m.senderName ?? 'Member';
                return (
                  <div key={m.id} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="bg-fg/10 text-fg/70 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    >
                      {initials(displayName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-medium">
                          {displayName}
                          {mine && <span className="text-muted font-normal"> (you)</span>}
                        </span>
                        <span className="text-muted text-xs">{timeLabel(m.createdAt)}</span>
                        {m.isEdited && !m.isDeleted && (
                          <span className="text-muted text-xs">(edited)</span>
                        )}
                      </div>
                      {m.isDeleted ? (
                        <p className="text-muted text-sm italic">Message deleted</p>
                      ) : editingId === m.id ? (
                        <div className="mt-1 flex flex-col gap-1">
                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={2}
                            className={fieldInputClass}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void saveEdit(m.id)}
                              className={primaryButtonClass('sm')}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditDraft('');
                              }}
                              className={textButtonClass('sm')}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm break-words whitespace-pre-wrap">{m.body}</p>
                      )}
                      {!m.isDeleted && editingId !== m.id && (
                        <div className="mt-0.5 flex gap-3">
                          {mine ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(m.id);
                                  setEditDraft(m.body);
                                }}
                                className="text-muted hover:text-fg text-xs"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void remove(m.id)}
                                className="text-muted text-xs hover:text-red-600"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void report(m.id)}
                              className="text-muted text-xs hover:text-red-600"
                            >
                              Report
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {!loading && (
          <form
            className="border-border-base flex items-end gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Message your team…"
              aria-label="Message"
              className={`${fieldInputClass} resize-none`}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className={primaryButtonClass('md')}
            >
              Send
            </button>
          </form>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
