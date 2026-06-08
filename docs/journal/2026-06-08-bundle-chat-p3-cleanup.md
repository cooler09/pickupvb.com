# 2026-06-08 — Chat-engine P3 cleanup (M-4, M-8, M-9, M-10)

Clears the remaining actionable P3s from the chat-engine deep-dive
([notifications-messaging.md](../audits/notifications-messaging.md)), leaving only
M-12 (e2e, deferred — it must run against a deployed target). Quad-green,
uncommitted. With this bundle every chat finding (M-1…M-11) is resolved.

## M-4 — Inbox pagination

`get_inbox(p_limit := 50)` capped the inbox at 50 and the page rendered all rows
with no `Pagination` (pattern #12 violation; conversations 51+ silently dropped).
No migration: the adapter now fetches `INBOX_FETCH_LIMIT = 200`
([supabase-messaging-repository.ts](../../packages/infrastructure/src/supabase-messaging-repository.ts))
and the [page](../../apps/web/src/app/messages/page.tsx) reads a `page` searchParam,
slices 20/page, and renders the shared `Pagination`. In-memory-slice variant
(the inbox is a derived list — titles/previews resolved in SQL); empty-state +
total read the full set. Beyond 200 active conversations the viewer sees the 200
most-recent by activity — fine for this community's scale.

## M-8 — "Load earlier" scroll anchor

`loadOlder` prepended an older page without preserving scroll, bouncing the reader
to the top. Now it captures `{ scrollHeight, scrollTop }` into a `restoreScrollRef`
just before the prepend, and the scroll effect restores
`scrollTop = newHeight − prevHeight + prevTop`. The effect was switched to an
**isomorphic layout effect** (client `useLayoutEffect`, SSR-safe no-op via
`typeof window !== 'undefined'`) so the correction lands before paint — no flash.
The at-bottom auto-scroll path is unchanged.

## M-9 — Blocked-state banner + composer disable

Blocking a DM counterpart left the composer enabled until the next send was
rejected. Introduced a client wrapper
[`DmThread`](../../apps/web/src/app/messages/[id]/_components/dm-thread.tsx) that
owns one `blocked` state shared by:

- a now-**controlled** [`BlockControl`](../../apps/web/src/app/messages/[id]/_components/block-control.tsx)
  (`{ blocked, onChange }`, optimistic with revert), and
- a new `blocked` prop on `ConversationView` that **replaces the composer with a
  banner** ("You've blocked this person. Unblock above to send a message.").

So blocking updates the composer immediately. The DM page renders `DmThread` for a
DM-with-live-counterpart and the plain title + view for rooms / deleted-counterpart
DMs.

**Scope limit (by design):** only the viewer's _own_ block is detectable — the
`user_blocks` SELECT policy is `blocker_id = auth.uid()`, so "the other party
blocked you" can't be read client-side without a privacy leak. That case still
surfaces via the M-2 send-rejection copy. Rooms never pass `blocked` (no block
relationship).

## M-10 — General per-message rate cap

Only attachment-bearing sends were throttled (40/day); text sends were unbounded
(uncapped DB writes + Realtime fan-out, RLS-confined but ungated). Every send now
consumes a general cap (`chat-msg`, **60 / 60s**) on the existing fixed-window
limiter before the handler runs; the attachment/day cap (`chat-attach`) stacks for
image sends. Both fail open. The `chat-actions.test.ts` cases were rewritten to
forward the limiter key and assert: text consumes only the message cap, images
consume both, and either cap rejects with `rate_limited` before the handler.

## What's left

- **M-12 — chat e2e.** Deferred at the maintainer's request: authoring is easy but
  it must run against a deployed target (two browser contexts) to be meaningful,
  so it can't go green in the local quad. It would cover live delivery, the M-7
  sender enrichment, M-3 token refresh, report auto-hide, and inbox-unread — the
  whole Realtime/RLS path that the unit quad can't see.
