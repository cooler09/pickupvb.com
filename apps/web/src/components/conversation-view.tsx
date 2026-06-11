'use client';

import Image from 'next/image';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  type ConversationKind,
  type MessageAttachment,
  type MessageAttachmentView,
  type MessageView,
} from '@pickupvb/domain';
import { primaryButtonClass, textButtonClass } from '@/components/primary-button';
import { fieldInputClass } from '@/components/field-styles';
import { ChatImage } from '@/components/chat-image';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert } from '@/components/alert';
import { useToast } from '@/components/toast';
import {
  deleteChatMessage,
  editChatMessage,
  loadOlderChatMessages,
  reportChatMessage,
  sendChatMessage,
  type ChatError,
} from '@/app/_actions/chat-actions';

const BUCKET = 'chat-attachments';

/** Layout effect on the client, no-op on the server — avoids the SSR warning
 * while still adjusting scroll before paint (so "load earlier" doesn't flash). */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Human-readable copy for a {@link ChatError}. Shared by every mutation in the
 * view so a failed send/edit/delete/report always tells the user something
 * instead of silently no-op-ing. */
function chatErrorMessage(error: ChatError): string {
  switch (error) {
    case 'forbidden':
      return 'You can no longer post in this conversation.';
    case 'rate_limited':
      return 'You’ve shared a lot of photos today. Please try again later.';
    case 'invalid':
      return 'Message could not be sent.';
    default:
      return 'Something went wrong. Try again.';
  }
}

type Props = {
  conversationId: string;
  viewerId: string;
  /** Surface kind — drives the moderation policy (mask rooms vs block-extreme
   * DMs, ADR 0030). Set server-side by the rendering page. */
  kind: ConversationKind;
  initialMessages: MessageView[];
  initialHasMore: boolean;
  initialNextBefore: string | null;
  /** Name lookup for live broadcast rows (which carry only `sender_id`). */
  participants: { id: string; name: string }[];
  /** DM only: the viewer has blocked the counterpart. Replaces the composer with
   * a banner so they don't type into a send that RLS will reject (audit M-9). */
  blocked?: boolean;
  /** Tailwind height bounds for the scrolling message list. Defaults to the
   * compact embedded-panel size (`max-h-96 min-h-48`) used on context pages; the
   * full-page `/messages/[id]` thread passes a viewport-relative value so it isn't
   * a tiny box in an empty column (audit MU-2). */
  listHeightClass?: string;
};

type SenderCard = { name: string; avatar: string | null };

/** A locally-uploaded image awaiting send: its persisted metadata + a local
 * object-URL preview shown in the composer strip. */
type Pending = { attachment: MessageAttachment; previewUrl: string };

/** Raw `messages` row as delivered on the `chat:{id}` Broadcast topic. */
type BroadcastRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachments: unknown;
  deleted_at: string | null;
  edited_at: string | null;
  created_at: string;
};

function toAttachmentViews(raw: unknown): MessageAttachmentView[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    const x = a as Partial<MessageAttachment>;
    return {
      bucket: x.bucket ?? BUCKET,
      path: x.path ?? '',
      width: x.width ?? null,
      height: x.height ?? null,
      mime: x.mime ?? 'image/*',
    };
  });
}

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

/** Local-zone calendar-day key (YYYY-MM-DD) for grouping messages into days —
 * pure (depends only on the ISO string), so it's safe to call in render. */
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA');
}

/** Human label for a day-separator row, e.g. "Sat, Jun 7" (audit MU-8). Uses the
 * viewer's local zone; absolute (no "Today"/"Yesterday") to stay pure — no `now`
 * is read in render. */
function dayDividerLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
}

/** Read an image's natural dimensions from a local File (best-effort). */
function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new globalThis.Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(src);
    };
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * The reusable live chat surface (ADR 0028) — message list, "load earlier",
 * composer (text + image attachments), and per-message edit / delete / report.
 * Shared by the context-room island ({@link RoomChatPanel}, which bootstraps
 * client-side then mounts this for team / event / group rooms) and the DM thread
 * page (which bootstraps server-side). It owns no access logic — the caller decides whether to render
 * it; this just needs an opened `conversationId` + the initial page, and
 * subscribes to the private `chat:{conversationId}` Broadcast topic for live
 * INSERT / UPDATE (the same pattern as the notification bell, ADR 0027).
 */
export function ConversationView({
  conversationId,
  viewerId,
  kind,
  initialMessages,
  initialHasMore,
  initialNextBefore,
  participants,
  blocked = false,
  listHeightClass = 'max-h-96 min-h-48',
}: Props) {
  const [messages, setMessages] = useState<MessageView[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextBefore, setNextBefore] = useState<string | null>(initialNextBefore);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Text fed to the sr-only polite live region (A5) when a message arrives
  // from someone else over Realtime.
  const [announcement, setAnnouncement] = useState('');
  // A message from someone else arrived while the reader was scrolled up — show
  // a "jump to latest" affordance instead of yanking the viewport (audit MU-11).
  const [hasNewBelow, setHasNewBelow] = useState(false);
  // Which message a confirm dialog is open for (delete / report), replacing the
  // native `window.confirm` (audit MU-5).
  const [pendingConfirm, setPendingConfirm] = useState<{
    kind: 'delete' | 'report';
    messageId: string;
  } | null>(null);
  const { show } = useToast();

  const listRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Composer textarea, for auto-growing it as the draft wraps (audit MU-6).
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // Set by `loadOlder` just before prepending an older page, so the next layout
  // pass can restore the viewport to where the reader was instead of jumping
  // (audit M-8). Holds the pre-prepend scrollHeight + scrollTop.
  const restoreScrollRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);

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

  // Live broadcast rows carry only `sender_id` (ADR 0028 — `broadcast_changes`
  // emits the raw `messages` row, no joined sender card). When a message arrives
  // from someone not already cached — a member who joined after page load, or a
  // captain who isn't on the seeded roster — fetch their public card once from
  // `profiles_public` (pitfall #13: the public projection, never base
  // `profiles`) and patch every already-rendered message from them. Deduped per
  // id; the viewer + seeded roster are already cached, so this only fires for
  // genuinely unknown senders. Resolves the "Member" fallback / sticky-cache
  // issue (notifications-messaging audit M-7).
  const pendingSenderFetches = useRef<Set<string>>(new Set());
  const ensureSenderCard = useCallback((id: string) => {
    if (!id || senderCards.current.has(id) || pendingSenderFetches.current.has(id)) return;
    pendingSenderFetches.current.add(id);
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from('profiles_public')
        .select('display_name, avatar_url')
        .eq('id', id)
        .maybeSingle();
      pendingSenderFetches.current.delete(id);
      const row = data as { display_name: string | null; avatar_url: string | null } | null;
      if (!row) return;
      const card: SenderCard = {
        name: row.display_name ?? 'Member',
        avatar: row.avatar_url ?? null,
      };
      senderCards.current.set(id, card);
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === id ? { ...m, senderName: card.name, senderAvatarUrl: card.avatar } : m,
        ),
      );
    })();
  }, []);

  // Seed sender names from the initial page once on mount.
  useEffect(() => {
    learnSenders(initialMessages);
  }, [initialMessages, learnSenders]);

  const recordToView = useCallback((rec: BroadcastRow): MessageView => {
    const deleted = rec.deleted_at !== null;
    // Resolve from the cache; an unknown sender stays null (rendered as the
    // 'Member' fallback) until `ensureSenderCard` fetches and patches it in.
    // Deliberately NOT cached as 'Member' here — that's what made the fallback
    // stick for the rest of the session (audit M-7).
    const card = senderCards.current.get(rec.sender_id) ?? null;
    return {
      id: rec.id,
      conversationId: rec.conversation_id,
      senderId: rec.sender_id,
      senderName: card?.name ?? null,
      senderAvatarUrl: card?.avatar ?? null,
      body: deleted ? '' : rec.body,
      attachments: deleted ? [] : toAttachmentViews(rec.attachments),
      isDeleted: deleted,
      isEdited: rec.edited_at !== null,
      createdAt: rec.created_at,
    };
  }, []);

  // ---- Realtime subscription ---------------------------------------------
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      // Set only the INITIAL realtime token here. supabase-js's own auth listener
      // forwards every later TOKEN_REFRESHED to `realtime.setAuth`, which pushes
      // the fresh JWT to already-joined channels — so a long-lived chat tab stays
      // authorized against the `realtime.messages` RLS policy across token
      // refresh. But that listener ignores INITIAL_SESSION, so the first token
      // must be set explicitly. Don't add a manual refresh handler (it would
      // duplicate the client's built-in one) and don't drop this initial call.
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      const onWrite = (msg: { payload: unknown }): MessageView | null => {
        const rec = (msg.payload as { record?: BroadcastRow }).record;
        if (!rec) return null;
        // Kick off a one-shot card fetch for an unknown sender (deduped); the
        // view renders 'Member' until it resolves and patches in.
        ensureSenderCard(rec.sender_id);
        const view = recordToView(rec);
        setMessages((prev) => mergeMessages(prev, [view]));
        return view;
      };

      // INSERTs additionally feed the sr-only live region — but only for
      // messages from *other* people (skip the viewer's own broadcast echo)
      // and never for edits/deletes. Bulk "load earlier" prepends go through
      // `loadOlder`, not this path, so history loads stay silent (A5).
      const onInsert = (msg: { payload: unknown }) => {
        const view = onWrite(msg);
        if (!view || view.isDeleted || view.senderId === viewerId) return;
        // Arrived while the reader is scrolled up — surface the jump affordance
        // rather than auto-scrolling them away from what they're reading (MU-11).
        if (!atBottomRef.current) setHasNewBelow(true);
        const who = view.senderName ?? 'New message';
        setAnnouncement(view.body ? `${who}: ${view.body}` : `${who} sent a photo`);
      };

      channel = supabase
        .channel(`chat:${conversationId}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, onInsert)
        .on('broadcast', { event: 'UPDATE' }, onWrite)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, recordToView, ensureSenderCard, viewerId]);

  // ---- Scroll management on message change --------------------------------
  // Runs before paint: if `loadOlder` just prepended a page, restore the
  // viewport to the reader's prior position (height grew at the top, so add the
  // delta to scrollTop — M-8); otherwise, if already at the bottom, stick to the
  // newest message.
  useIsomorphicLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const restore = restoreScrollRef.current;
    if (restore) {
      el.scrollTop = el.scrollHeight - restore.prevHeight + restore.prevTop;
      restoreScrollRef.current = null;
      return;
    }
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = atBottom;
    if (atBottom) setHasNewBelow(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setHasNewBelow(false);
  }, []);

  // ---- Attachments --------------------------------------------------------
  const pickFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setUploading(true);
      const supabase = createSupabaseBrowserClient();
      const room = MAX_ATTACHMENTS - pending.length;
      const added: Pending[] = [];
      for (const file of Array.from(files).slice(0, Math.max(room, 0))) {
        if (!file.type.startsWith('image/')) {
          setError('Only images can be attached.');
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError('Image is too large (max 10 MB).');
          continue;
        }
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png';
        const path = `${conversationId}/${viewerId}/${crypto.randomUUID()}.${ext ?? 'png'}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type });
        if (upErr) {
          setError('Upload failed. Try again.');
          continue;
        }
        const dims = await imageDimensions(file).catch(() => null);
        added.push({
          attachment: {
            bucket: BUCKET,
            path,
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            mime: file.type,
            size: file.size,
          },
          previewUrl: URL.createObjectURL(file),
        });
      }
      setPending((prev) => [...prev, ...added]);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [conversationId, viewerId, pending.length],
  );

  const removePending = useCallback((path: string) => {
    setPending((prev) => {
      const hit = prev.find((p) => p.attachment.path === path);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((p) => p.attachment.path !== path);
    });
  }, []);

  const send = useCallback(async () => {
    const body = draft.trim();
    const attachments = pending.map((p) => p.attachment);
    if ((!body && attachments.length === 0) || sending) return;
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
      attachments: attachments.map((a) => ({
        bucket: a.bucket,
        path: a.path,
        width: a.width,
        height: a.height,
        mime: a.mime,
      })),
      isDeleted: false,
      isEdited: false,
      createdAt: new Date().toISOString(),
    };
    const sentPending = pending;
    atBottomRef.current = true;
    setMessages((prev) => mergeMessages(prev, [tempView]));
    setDraft('');
    setPending([]);
    // Collapse the auto-grown composer back to one row (audit MU-6).
    if (composerRef.current) composerRef.current.style.height = 'auto';
    const res = await sendChatMessage(conversationId, body, attachments, kind);
    setSending(false);
    if (!res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== tempView.id));
      setDraft(body);
      setPending(sentPending);
      setError(chatErrorMessage(res.error));
      return;
    }
    for (const p of sentPending) URL.revokeObjectURL(p.previewUrl);
    // Reconcile the temp id to the real id so a slow broadcast cannot duplicate.
    setMessages((prev) =>
      prev.some((m) => m.id === res.value.id)
        ? prev.filter((m) => m.id !== tempView.id)
        : prev.map((m) => (m.id === tempView.id ? { ...m, id: res.value.id } : m)),
    );
  }, [conversationId, viewerId, draft, pending, sending, resolveSender, kind]);

  const loadOlder = useCallback(async () => {
    if (!nextBefore || loadingOlder) return;
    setLoadingOlder(true);
    const res = await loadOlderChatMessages(conversationId, nextBefore);
    setLoadingOlder(false);
    if (!res.ok) return;
    learnSenders(res.value.messages);
    atBottomRef.current = false;
    // Capture the pre-prepend metrics so the layout effect can hold the reader's
    // position once the older page is inserted above the current view (M-8).
    const el = listRef.current;
    if (el) restoreScrollRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop };
    setMessages((prev) => mergeMessages(prev, res.value.messages));
    setHasMore(res.value.hasMore);
    setNextBefore(res.value.nextBefore);
  }, [conversationId, nextBefore, loadingOlder, learnSenders]);

  const saveEdit = useCallback(
    async (messageId: string) => {
      const body = editDraft.trim();
      if (!body) return;
      const res = await editChatMessage(messageId, body, kind);
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, body, isEdited: true } : m)),
        );
        setEditingId(null);
        setEditDraft('');
        setError(null);
        return;
      }
      // Keep the editor open so the user's text isn't lost. A moderation block
      // comes back as 'invalid'.
      setError(
        res.error === 'invalid'
          ? 'Your edit couldn’t be saved — it may contain blocked content.'
          : chatErrorMessage(res.error),
      );
    },
    [editDraft, kind],
  );

  // Confirmed by the ConfirmDialog (audit MU-5), not the native window.confirm.
  const performDelete = useCallback(async (messageId: string) => {
    const res = await deleteChatMessage(messageId);
    if (res.ok) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, isDeleted: true, body: '', attachments: [] } : m,
        ),
      );
    } else {
      setError(chatErrorMessage(res.error));
    }
  }, []);

  const performReport = useCallback(
    // `reason` is the optional note collected by the dialog (audit MU-14) —
    // previously always null.
    async (messageId: string, reason: string | null) => {
      const res = await reportChatMessage(messageId, reason);
      show(
        res.ok
          ? { variant: 'success', message: 'Reported. Thanks for flagging it.' }
          : { variant: 'error', message: chatErrorMessage(res.error) },
      );
    },
    [show],
  );

  const empty = useMemo(() => messages.filter((m) => !m.isDeleted).length === 0, [messages]);
  const canSend = (draft.trim().length > 0 || pending.length > 0) && !sending && !uploading;

  return (
    <div className="border-border-base bg-md-surface-container rounded-shape-sm flex flex-col overflow-hidden border">
      <div className="relative">
        <div
          ref={listRef}
          onScroll={onScroll}
          className={`flex ${listHeightClass} flex-col gap-3 overflow-y-auto p-3`}
        >
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
          {empty && <p className="text-muted m-auto text-sm">No messages yet — say hi.</p>}
          {messages.map((m, i) => {
            const mine = m.senderId === viewerId;
            // `senderName` is resolved when the view is built (load / broadcast),
            // so render stays pure — never read the sender-card ref here.
            const displayName = m.senderName ?? 'Member';
            // A divider whenever the calendar day changes between adjacent
            // messages, so a multi-day thread isn't one undifferentiated run (MU-8).
            const showDay = i === 0 || dayKey(messages[i - 1]!.createdAt) !== dayKey(m.createdAt);
            return (
              <Fragment key={m.id}>
                {showDay && (
                  <div className="my-1 flex items-center gap-3">
                    <span className="bg-border-base h-px flex-1" />
                    <span className="text-muted shrink-0 text-xs">
                      {dayDividerLabel(m.createdAt)}
                    </span>
                    <span className="bg-border-base h-px flex-1" />
                  </div>
                )}
                <div className="flex items-start gap-2">
                  {m.senderAvatarUrl ? (
                    <Image
                      src={m.senderAvatarUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="bg-fg/10 text-fg/70 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    >
                      {initials(displayName)}
                    </span>
                  )}
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
                          onKeyDown={(e) => {
                            // Match the composer's affordances (audit MU-7): Enter
                            // saves, Shift+Enter newlines, Escape cancels.
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void saveEdit(m.id);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingId(null);
                              setEditDraft('');
                            }
                          }}
                          rows={2}
                          maxLength={4000}
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
                      <>
                        {m.body && (
                          <p className="text-sm break-words whitespace-pre-wrap">{m.body}</p>
                        )}
                        {m.attachments.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {m.attachments.map((a) => (
                              <ChatImage key={a.path} attachment={a} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {!m.isDeleted && editingId !== m.id && (
                      <div className="mt-0.5 flex gap-3">
                        {mine ? (
                          <>
                            {m.body && (
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
                            )}
                            <button
                              type="button"
                              onClick={() => setPendingConfirm({ kind: 'delete', messageId: m.id })}
                              className="text-muted hover:text-md-error text-xs"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingConfirm({ kind: 'report', messageId: m.id })}
                            className="text-muted hover:text-md-error text-xs"
                          >
                            Report
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
        {hasNewBelow && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="bg-primary text-primary-fg shadow-elevation-2 hover:shadow-elevation-3 absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium transition-shadow"
          >
            New messages ↓
          </button>
        )}
      </div>

      {blocked ? (
        <p className="border-border-base text-muted border-t p-3 text-center text-sm">
          You’ve blocked this person. Unblock above to send a message.
        </p>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="border-border-base flex flex-wrap gap-2 border-t p-2">
              {pending.map((p) => (
                <div key={p.attachment.path} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview before send */}
                  <img
                    src={p.previewUrl}
                    alt="Attachment preview"
                    className="h-16 w-16 rounded-md object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePending(p.attachment.path)}
                    aria-label="Remove attachment"
                    className="bg-fg/70 absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            className="border-border-base flex items-end gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void pickFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || pending.length >= MAX_ATTACHMENTS}
              aria-label="Attach image"
              className="tap-target text-fg/70 hover:bg-fg/5 hover:text-primary rounded-md disabled:opacity-50"
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
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                // Auto-grow up to ~6 rows so a multi-line draft is visible
                // instead of scrolling inside one row (audit MU-6).
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={uploading ? 'Uploading…' : 'Type a message…'}
              aria-label="Message"
              className={`${fieldInputClass} resize-none`}
            />
            <button type="submit" disabled={!canSend} className={primaryButtonClass('md')}>
              Send
            </button>
          </form>
        </>
      )}
      {error && (
        <div className="border-border-base border-t p-2">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {pendingConfirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o) setPendingConfirm(null);
          }}
          title={pendingConfirm.kind === 'delete' ? 'Delete this message?' : 'Report this message?'}
          description={
            pendingConfirm.kind === 'delete'
              ? 'This removes it for everyone. You can’t undo this.'
              : 'Our moderators will review it.'
          }
          confirmLabel={pendingConfirm.kind === 'delete' ? 'Delete' : 'Report'}
          danger={pendingConfirm.kind === 'delete'}
          {...(pendingConfirm.kind === 'report'
            ? {
                reason: {
                  label: 'Reason (optional)',
                  placeholder: 'What’s wrong with this message?',
                },
              }
            : {})}
          onConfirm={(reason) => {
            const c = pendingConfirm;
            setPendingConfirm(null);
            if (c.kind === 'delete') void performDelete(c.messageId);
            else void performReport(c.messageId, reason);
          }}
        />
      )}
      {/* Visually-hidden polite live region: announces messages arriving from
          others over Realtime so screen-reader users hear new chat without a
          role="log" container re-reading the viewer's own echoes or the whole
          history on "load earlier" (A5). */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
