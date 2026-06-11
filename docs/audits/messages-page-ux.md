# Messages Page UX Audit

_Last updated: 2026-06-09_

UX/UI evaluation of the **messages surface** — the inbox
([apps/web/src/app/messages/page.tsx](../../apps/web/src/app/messages/page.tsx)),
the dedicated thread page
([apps/web/src/app/messages/[id]/page.tsx](../../apps/web/src/app/messages/[id]/page.tsx)),
and the shared live chat component
([apps/web/src/components/conversation-view.tsx](../../apps/web/src/components/conversation-view.tsx))
that backs both the thread page and the in-context room panels
([room-chat-panel.tsx](../../apps/web/src/components/room-chat-panel.tsx)).

Goal: the same persona lens as the other page-UX audits — make the inbox answer
_"which conversation has something new and who's it with?"_ at a glance, and make
the thread view feel like a real chat (orientation, faces, space, read affordances)
rather than a small embedded widget reused full-page.

This file is complementary to — not a duplicate of:

- [notifications-messaging.md](notifications-messaging.md) — the **chat-engine
  deep-dive** (ADR 0028): domain → RLS → delivery channels. Its M-1…M-12 findings
  (swallowed errors, inbox pagination, server-UTC dates, "Member" broadcast
  fallback, load-earlier scroll jump, blocked banner, rate limits, e2e) are
  **already resolved/deferred** — **do not re-file them here.** This audit is the
  pure UX/UI layer that pass didn't cover (orientation, visual hierarchy, space,
  affordances, dead plumbing).
- [persona-ux.md](persona-ux.md) — CTA/field vocabulary (MU-5 routes through the
  same Radix-overlay direction as accessibility C7).
- [m3-alignment.md](m3-alignment.md) — MU-10 is the `<Alert>`/role-token pattern
  (#17).

> **Status update (2026-06-09):** New persona-lens evaluation of the messages
> surface. **0 P1 · 4 P2 · 11 P3.** The engine is solid (the 2026-06-08 deep-dive
> hardened it); what remains is UX polish.
>
> **2026-06-09 — all four P2s FIXED (uncommitted, quad-green).** MU-1 (room
> threads now resolve their team/event/group title + a back-link to the context,
> with a "Team/Event/Group chat" sub-label, instead of the generic
> "Conversation"); MU-2 (`ConversationView` gained a `listHeightClass` prop — the
> full-page `/messages/[id]` thread fills `max-h-[65vh] min-h-[20rem]` while
> context-page panels keep the compact `max-h-96`); MU-3 (sender avatars now
> render via `next/image`, falling back to the initials chip — the previously
> dead `senderAvatarUrl` plumbing now has output); MU-4 (`get_inbox` gained a
> `preview_sender_name` column from `profiles_public`, threaded through
> `InboxItem`, so room previews read "Alex: …"). The MU-4 migration
> (`20261007000000_inbox_preview_sender_name.sql`) is deploy-gated; the generated
> types were hand-edited and will regenerate on the next `gen:types`.
>
> **2026-06-09 — all 11 P3s FIXED (uncommitted, quad-green), one partial.**
> Inbox: MU-12 (rooms now open `/messages/{id}`, unified with the bell — no more
> burying the chat on a long context page), MU-13 (copy names DMs), MU-9
> (recency-aware stamps: today→time, week→weekday, older→date). Thread:
> MU-6 (composer auto-grows to ~6 rows), MU-7 (edit box gets Enter/Shift+Enter/Esc
>
> - `maxLength`), MU-8 (day-separator rows), MU-10 (error → padded `<Alert>`),
>   MU-11 ("New messages ↓" jump pill when scrolled up). MU-5 + MU-14 retired the
>   two `window.confirm` calls for a reusable Radix `ConfirmDialog`
>   ([confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx)) whose
>   Report variant collects the (previously always-null) moderator reason. **MU-15
>   partial:** the live-inbox half shipped (an `InboxLiveRefresh` island
>   `router.refresh()`es on `chat.message.received`); the **compose-from-inbox
>   people-picker is deferred** as a product feature (see MU-15). Net: 0 open P2,
>   1 partial P3 (compose entry).

---

## P1 — ship-blocking

_None._ The flows work; every finding below is orientation / hierarchy / polish.

---

## P2 — next-sprint hardening

### MU-1 — Room threads opened at `/messages/[id]` render the heading "Conversation" with no room name and no link back to the context — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

The thread page only reads `conversations(id, kind)` and resolves the **DM**
counterpart; for a `team`/`event`/`group` room there is no title lookup, so
`heading` falls through to the literal string **"Conversation"**:

```ts
// messages/[id]/page.tsx:65-66
const heading = otherCard?.displayName ?? (conv.kind === 'dm' ? 'Direct message' : 'Conversation');
```

This is the **primary deep-link target for room pushes** — `notifyChatMessage`
links rooms to `/messages/{conversationId}`
([notify-chat.ts](../../apps/web/src/lib/notify-chat.ts)), not to the context
page. So a user tapping a team/event/group notification lands on a page whose
body heading is "Conversation", whose `<title>` is the static "Messages —
PickupVB", and which offers **no link to the team/group/event** it belongs to.
The DM branch gets a profile-linked header ([dm-thread.tsx:47-55](../../apps/web/src/app/messages/[id]/_components/dm-thread.tsx#L47-L55));
rooms get nothing. The inbox already resolves a real title via `get_inbox`, so the
data exists — it's just not resolved on this page.

**Fix:** resolve the room header on the thread page and render it like the DM
header (title + a link to the context). Either add a small
`get_conversation_header(id)` RPC (mirrors the title/slug resolution already in
`get_inbox`), or branch on `conv.kind` to read `teams.name`+slug /
`groups.name`+slug / `events.title`+id and pass `heading` + a context `href` into
a shared room-header. While there, set a per-conversation `<title>` (the room/DM
name) instead of the static metadata. Grade P2 — embarrassing and disorienting on
the main room-push path, but functional (rooms are also reachable from their
context pages).
[messages/[id]/page.tsx#L34-L93](../../apps/web/src/app/messages/[id]/page.tsx#L34-L93)

**Fixed.** The thread page now selects `context_id` and, for a non-DM room,
resolves the title + a context `href` per kind (`teams`/`groups` name+slug,
`events` title+id — the viewer is a room member, so the user-scoped read passes
RLS). The heading falls back `otherCard → roomTitle → "Conversation"`, renders as
a `<Link>` to the context when resolved, and carries a muted "Team/Event/Group
chat" sub-label (`ROOM_KIND_LABEL`). The static `<title>` metadata was left as-is
(a `generateMetadata` would double the conversation read for the tab title only —
deferred).

### MU-2 — The dedicated thread page wastes vertical space: the shared chat box is hard-capped at 384 px — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

`ConversationView`'s scroll region is `max-h-96 min-h-48`
([conversation-view.tsx:510-513](../../apps/web/src/components/conversation-view.tsx#L510-L513)) —
a fixed 24 rem (384 px) cap that is correct for an **embedded room panel** sitting
among other sections on `/teams/[id]` / `/groups/[id]` / `/events/[id]`, but the
**same component renders full-page** at `/messages/[id]`. On a laptop the
dedicated DM/thread view is a ~5-message-tall box floating in the middle of an
otherwise empty `max-w-2xl` column, with the composer pinned inside it rather than
at the bottom of the screen — it reads like a widget, not a conversation.

**Fix:** make the height configurable — add a `heightClass` (or `fill?: boolean`)
prop. Context-page panels keep `max-h-96`; the thread page passes a
viewport-filling height (e.g. wrap the page in `h-[calc(100dvh-…)]` and give the
list `flex-1 min-h-0`, or a simpler `max-h-[70vh]`). The scroll/auto-stick logic
is already height-agnostic, so this is a styling-prop change only.
[conversation-view.tsx#L508-L513](../../apps/web/src/components/conversation-view.tsx#L508-L513)

**Fixed.** `ConversationView` gained a `listHeightClass` prop defaulting to the
compact `max-h-96 min-h-48` (so the ~3 context-page panel call sites are
unchanged). The thread page (`DmThread` + the room branch) passes
`max-h-[65vh] min-h-[20rem]` (`THREAD_LIST_HEIGHT`) — a viewport-relative height
that fills a laptop without overflowing short screens (it's a `max`, and the
composer sits below). Took the lighter `max-h-[Nvh]` route over a global
height-shell restructure to keep the back-link/header layout untouched.

### MU-3 — Avatars are fetched and threaded end-to-end but never rendered (dead plumbing + faceless chat) — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

Sender avatars are resolved at **every** layer:
`loadSenderCards` selects `avatar_url` from `profiles_public`
([supabase-messaging-repository.ts:292-304](../../packages/infrastructure/src/supabase-messaging-repository.ts#L292-L304)),
`MessageView.senderAvatarUrl` carries it
([message-queries.ts:29](../../packages/domain/src/messaging/message-queries.ts#L29)),
and the client threads it through `learnSenders`, `ensureSenderCard`'s live
patch, and the optimistic temp view
([conversation-view.tsx:183,222,245,400](../../apps/web/src/components/conversation-view.tsx#L178-L226)).
But the message row **only ever renders the text initials** — `senderAvatarUrl` is
never read in JSX:

```tsx
// conversation-view.tsx:533-538 — always initials, never the avatar
<span aria-hidden className="bg-fg/10 …">
  {initials(displayName)}
</span>
```

So a fetched-and-patched `avatar_url` column feeds nothing on screen — it's both
**stale plumbing** (work done for no output, including the extra `avatar_url` in
the `ensureSenderCard` round-trip) and a **UX gap** (the chat has no faces, which
hurts scanability in busy rooms).

**Fix (preferred):** render the avatar — `senderAvatarUrl ? <img …> : <initials
chip>`, plain `<img>` (avatars are stable public URLs; the initials chip becomes
the `onError`/placeholder). Keeps render pure (the URL is resolved before paint,
per the existing M-7 comment). **Fix (alternative):** if faces are deliberately
unwanted, delete `avatar_url` from `loadSenderCards` / `SenderCard` /
`ensureSenderCard` and drop `senderAvatarUrl` from the view to remove the dead
plumbing. Don't leave it half-wired.
[conversation-view.tsx#L526-L538](../../apps/web/src/components/conversation-view.tsx#L526-L538)

**Fixed (render it).** The message row now renders `m.senderAvatarUrl` via
`next/image` (28 px, `rounded-full object-cover`, matching the `attendee-list`
roster pattern — avatars are stable public `profiles_public` URLs, so `next/image`
fits, unlike the ephemeral signed chat-image URLs), falling back to the existing
initials chip when null. The previously-dead `senderAvatarUrl` / `SenderCard.avatar`
plumbing now has output, and the chat has faces.

### MU-4 — Room inbox previews can't say who sent the last message — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

The inbox preview is `You: {body}` for the viewer's own last message, else the
**bare body** with no author:

```tsx
// messages/page.tsx:95-100
item.previewSenderId === user.id ? `You: ${item.preview}` : item.preview;
```

`InboxItem` carries `previewSenderId` but **no preview sender name**
([message-queries.ts:66-78](../../packages/domain/src/messaging/message-queries.ts#L66-L78)),
so in a busy team/event/group room you see "ok sounds good" with no idea whether
that's the captain or a random member. DMs are fine (the title _is_ the person),
but rooms lose the most useful inbox signal — _who_ just spoke.

**Fix:** resolve a short preview-sender first name in `get_inbox` and add it to
`InboxItem` (e.g. `previewSenderName`), then render `"{name}: {preview}"` for room
kinds (skip for DMs). The RPC already joins the message row; this is one more
`profiles_public.display_name` lookup in SQL.
[messages/page.tsx#L92-L120](../../apps/web/src/app/messages/page.tsx#L92-L120)

**Fixed.** New migration
[20261007000000_inbox_preview_sender_name.sql](../../supabase/migrations/20261007000000_inbox_preview_sender_name.sql)
adds a `preview_sender_name` column to `get_inbox`, resolved from
`profiles_public` for the latest non-deleted message's sender (same SECURITY
INVOKER + owner-only-profiles reasoning as the DM-title fix — the view bypasses
base RLS; a since-deleted sender → `NULL`). Threaded through `InboxItem`
(`previewSenderName`), `InboxRpcRow` → `rowToInbox`, and the hand-edited generated
types. The inbox renders `"{firstName}: {preview}"` for room kinds (DMs unchanged
— the title is the person; the viewer's own line stays "You:"). Migration is
deploy-gated; types regenerate on the next `gen:types`.

---

## P3 — nice-to-have

### MU-5 — Native `window.confirm()` for delete & report — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

`remove` and `report` gate on the unstyled, thread-blocking browser dialog:

```ts
// conversation-view.tsx:479, 494
if (!window.confirm('Delete this message?')) return;
if (!window.confirm('Report this message to the moderators?')) return;
```

This clashes with the M3 design system and the repo's Radix direction
(accessibility C7 just migrated six hand-rolled overlays to Radix dialog/popover).
**Fix:** route through a styled confirm (Radix `AlertDialog` / the
`ConfirmSubmitButton` pattern), or — for delete — an **undo toast** (delete
optimistically and surface "Message deleted · Undo" via `useToast`, matching the
M3 Snackbar already in the tree). Report can become a one-tap toast-confirmed flag.
[conversation-view.tsx#L478-L503](../../apps/web/src/components/conversation-view.tsx#L478-L503)

### MU-6 — Composer textarea doesn't auto-grow — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

`rows={1}` + `resize-none`
([conversation-view.tsx:698-712](../../apps/web/src/components/conversation-view.tsx#L698-L712)) —
a multi-line draft scrolls inside a single visible row, so the user can't see what
they've typed, and `resize-none` removes the manual handle too. **Fix:** auto-grow
on input to a max height (`el.style.height='auto'; el.style.height =
Math.min(el.scrollHeight, MAX_PX)+'px'`), capping at ~6 rows, then snap back to one
row after send.

### MU-7 — The inline edit box lacks the composer's keyboard affordances and `maxLength` — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

The edit `<textarea>`
([conversation-view.tsx:554-559](../../apps/web/src/components/conversation-view.tsx#L554-L559))
has **no** Enter-to-save / Escape-to-cancel (the composer has Enter-to-send /
Shift+Enter) and **no** `maxLength={4000}` (the composer caps it), so an over-long
edit submits and fails with the generic "…may contain blocked content" copy.
**Fix:** add the same `onKeyDown` (Enter saves, Shift+Enter newline, Escape cancels)
and `maxLength` to the edit box.

### MU-8 — No day separators or same-sender grouping in threads — ✅ FIXED 2026-06-09 (day separators; same-sender grouping deferred)

Every message renders its own avatar+name+time row and only a **time-of-day** label
(`timeLabel` → "3:42 PM"); there are no "Today / Yesterday / Jun 7" dividers between
calendar days
([conversation-view.tsx:526-549](../../apps/web/src/components/conversation-view.tsx#L526-L549)).
A multi-day thread reads as one undifferentiated run, and a same-sender burst
repeats the name/avatar on every line. **Fix:** insert a centered date divider when
the calendar day changes between consecutive messages, and collapse the
avatar/name header for consecutive messages from the same sender within a short
window (keep the hover/inline timestamp).

### MU-9 — Inbox timestamps are date-only and absolute, even for today — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

`stamp` returns only month/day ("Jun 9")
([messages/page.tsx:50-57](../../apps/web/src/app/messages/page.tsx#L50-L57)), so
every conversation touched today reads "Jun 9" with no time — recency within a day
is unreadable. **Fix:** relative-ish formatting on the (already ET-defaulted, pure)
ISO string — today → time ("3:42 PM"), within a week → weekday ("Mon"), older →
"Jun 7". Stays server-pure (no `Date.now()` in render — derive "today" from a
prop/`searchParams`-free constant or accept the ET-day boundary as the existing
`DEFAULT_TIME_ZONE` already does).

### MU-10 — The error banner has no padding and renders below the composer — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

`{error && <p role="alert" className="text-md-error text-xs">…}`
([conversation-view.tsx:719-723](../../apps/web/src/components/conversation-view.tsx#L719-L723))
has no `p-3`, so it hugs the rounded container edge, and it sits **after** the
composer instead of adjacent to the failed action. **Fix:** wrap it with container
padding (`border-t p-3`, like the blocked banner) or, better, use `<Alert
variant="error">` (m3-alignment pattern #17). Also `remove`/`report` set the error
but never clear it on a later success — only `send`/`saveEdit` reset it; clear on
the next successful mutation.

### MU-11 — No "new messages" affordance when scrolled up — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

When the reader scrolls up to read history, incoming messages correctly **don't**
yank the viewport (`atBottomRef`,
[conversation-view.tsx:315-331](../../apps/web/src/components/conversation-view.tsx#L315-L331)),
but a new message just appends silently off-screen — there's no "↓ New messages"
pill or jump-to-latest button. **Fix:** when a non-own message arrives while
`!atBottomRef.current`, show a floating "New messages ↓" button that scrolls to
bottom (reuse the `announcement` signal that already fires for SR users).

### MU-12 — Inbox links to room context pages don't anchor to the chat — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

`inboxHref` routes rooms to `/teams/{slug}` / `/groups/{slug}` / `/events/{id}`
with **no hash**
([messages/page.tsx:28-39](../../apps/web/src/app/messages/page.tsx#L28-L39)),
dropping the reader at the top of a long context page; only the events page even
defines a chat anchor (`anchorId="chat"` —
[events/[id]/page.tsx:445](../../apps/web/src/app/events/[id]/page.tsx#L445)), and
the inbox link doesn't use it. So "open this conversation" from the inbox doesn't
actually show the conversation — and it diverges from the **notification**, which
deep-links rooms to `/messages/{id}`. **Fix (preferred):** route rooms to
`/messages/{conversationId}` like the bell does — a focused thread, consistent
entry from both surfaces (pairs with MU-1's header fix and removes the
bell-vs-inbox split). **Alternative:** append `#chat` and add `anchorId="chat"` to
the teams/groups panels too.

### MU-13 — Inbox copy omits direct messages — ✅ FIXED 2026-06-09 (uncommitted, quad-green)

The subtitle "Your team, event, and group conversations."
([messages/page.tsx:80](../../apps/web/src/app/messages/page.tsx#L80)) and the
empty-state "Your team, event, and group chats show up here."
([messages/page.tsx:86-88](../../apps/web/src/app/messages/page.tsx#L86-L88)) both
omit DMs, which the inbox _does_ list (and `KIND_LABEL` includes "Direct message").
**Fix:** "Your direct messages and team, event, and group conversations." (or just
"Your conversations") in both spots.

### MU-14 — "Report" always sends a `null` reason — ✅ FIXED 2026-06-09 (folded into MU-5's ConfirmDialog)

The report flow calls `reportChatMessage(messageId, null)`
([conversation-view.tsx:495](../../apps/web/src/components/conversation-view.tsx#L495)),
yet the action and `ReportMessageCommand` accept a reason — so the reason plumbing
is dead from this (the only) surface. **Fix:** either collect a short reason (a tiny
select/textarea in the confirm step from MU-5) or document the `null` as an
intentional quick-flag and note the param exists for a future moderator surface.
Low priority — flag only.

### MU-15 — No compose entry from the inbox, and the inbox list isn't live — ⚠️ PARTIAL 2026-06-09 (live refresh shipped; compose picker deferred)

A DM can only be started from a player profile ("Message" button); `/messages` has
no "New message" affordance, so the inbox is a pure read entry point. Separately,
the inbox is a static server render — a message arriving while the user sits on
`/messages` bumps the nav badge (`MessagesNavLink` is live) but **doesn't update the
list** until navigation. **Fix:** (a) optional "New message" button → a people
picker over followed users (`startDmWithUser` already exists); (b) subscribe the
inbox to the shared `notifications:{uid}` topic and `router.refresh()` on
`chat.message.received` for a live list — or accept (b) as a documented tradeoff
(the badge already nudges; the list re-syncs on open).

**Partially fixed — (b) shipped, (a) deferred.** An
[`InboxLiveRefresh`](../../apps/web/src/app/messages/_components/inbox-live-refresh.tsx)
island subscribes to the shared `notifications:{uid}` topic and `router.refresh()`es
the server-rendered list on `chat.message.received`, so previews / unread dots /
ordering reconcile without a navigation (the upstream coalescing bounds the refresh
rate). The **compose-from-inbox people-picker is deferred as a product decision** —
DMs remain contextual (started from a player profile), and a directory-style "New
message" picker is a feature, not a polish fix. Revisit if DM-initiation friction
shows up in usage.

---

## Remediation log

**2026-06-09 — audit filed + all four P2s shipped (uncommitted, quad-green).**

- **MU-1** — `/messages/[id]` resolves the room title + a context back-link
  (per-kind read of `teams`/`groups`/`events`) and a "Team/Event/Group chat"
  sub-label; heading falls back `counterpart → roomTitle → "Conversation"`.
  ([messages/[id]/page.tsx](../../apps/web/src/app/messages/[id]/page.tsx))
- **MU-2** — `ConversationView` `listHeightClass` prop (default `max-h-96
min-h-48`); thread page passes `max-h-[65vh] min-h-[20rem]` via `DmThread` +
  the room branch.
  ([conversation-view.tsx](../../apps/web/src/components/conversation-view.tsx),
  [dm-thread.tsx](../../apps/web/src/app/messages/[id]/_components/dm-thread.tsx))
- **MU-3** — message rows render `senderAvatarUrl` via `next/image`, initials
  fallback when null.
  ([conversation-view.tsx](../../apps/web/src/components/conversation-view.tsx))
- **MU-4** — `get_inbox` + `preview_sender_name`
  ([20261007000000](../../supabase/migrations/20261007000000_inbox_preview_sender_name.sql),
  deploy-gated; types hand-edited) → `InboxItem.previewSenderName` → room
  previews read "Alex: …".
  ([messages/page.tsx](../../apps/web/src/app/messages/page.tsx))

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.

**2026-06-09 — P3 sweep shipped (uncommitted, quad-green).**

- **MU-5 + MU-14** — new reusable
  [`ConfirmDialog`](../../apps/web/src/components/confirm-dialog.tsx) (controlled
  Radix dialog, `danger` + optional `reason` props) retires the two
  `window.confirm` calls; the Report variant collects the moderator reason
  (previously always `null`), passed through `reportChatMessage`.
- **MU-6** — composer auto-grows on input to ~6 rows (`scrollHeight`-driven,
  160 px cap), collapses after send.
- **MU-7** — edit box gets Enter-saves / Shift+Enter-newlines / Escape-cancels +
  `maxLength={4000}`.
- **MU-8** — day-separator rows (`dayKey`/`dayDividerLabel`, pure on the ISO) when
  the calendar day changes between adjacent messages. Same-sender grouping deferred.
- **MU-9** — recency-aware inbox `stamp(iso, now)` (today→time, <7 d→weekday,
  else→"Jun 7"); `now` from the page boundary keeps it pure.
- **MU-10** — error → padded `<Alert variant="error">` (was an unpadded `<p>`).
- **MU-11** — "New messages ↓" jump pill when a message arrives while scrolled up
  (`hasNewBelow` + `scrollToBottom`).
- **MU-12** — `inboxHref` routes every conversation to `/messages/{id}` (unified
  with the bell); the room-context split is gone.
- **MU-13** — inbox subtitle + empty-state name DMs.
- **MU-15** — `InboxLiveRefresh` island live-refreshes the list; compose-picker
  deferred (product).
  ([conversation-view.tsx](../../apps/web/src/components/conversation-view.tsx),
  [messages/page.tsx](../../apps/web/src/app/messages/page.tsx),
  [inbox-live-refresh.tsx](../../apps/web/src/app/messages/_components/inbox-live-refresh.tsx))

**Remaining backlog:** MU-15(a) compose-from-inbox people-picker (product
decision) and MU-8's same-sender message grouping (deferred polish). No open P1/P2.
