# 2026-06-08 — Chat engine cheap/high-value fixes (ADR 0028)

Follows the 2026-06-08 chat-engine deep-dive in
[notifications-messaging.md](../audits/notifications-messaging.md) (the prior
notifications audit centered on the delivery channels; this pass walked the
chat/DM engine itself — domain → RLS). The deep-dive logged 0 P1, 3 P2, 9 P3.
This bundle clears the **cheap, app-layer, no-migration cluster** (M-2, M-5, M-6,
M-11); the structural items (M-1 event/group rooms, M-3 Realtime token refresh,
and the remaining P3s) are left as backlog. Quad-green, uncommitted.

## M-6 — Notification preview leaked unmoderated room text

### Root cause

`sendChatMessage` passed the **raw** `body` to `notifyChatMessage`, which built
the push/bell preview from it. For a room (mask policy) the stored message is
censored, but the notification showed the original — masking leaked through the
notification channel. The moderated text existed only inside the aggregate
(`Message.compose` runs `contentModeration.screen`), and `SendMessageHandler`
threw it away, returning just `{ id }`.

### Fix

`SendMessageHandler.execute` now returns `{ id, body }` where `body` is
`message.body` (the screened, stored text), and `sendChatMessage` previews from
`out.body`. Threading the moderated body out of the handler — rather than
re-screening in the web layer — keeps the policy decision (mask vs block-extreme
by `kind`) in one place. Pinned by a `message.handler.test.ts` case asserting the
returned body for a room send is masked.

## M-2 — Mutation failures were swallowed with no user feedback

`ConversationView`'s `saveEdit` / `remove` / `report` branched on `res.ok` with no
else, and `saveEdit` cleared the editor unconditionally — so a moderation-blocked
edit **silently discarded the user's text**. `handleMessage` on the player profile
ignored `startDmWithUser` failures, so "Message" on a blocked profile did nothing.

Added a shared `chatErrorMessage(ChatError)` helper (also de-duplicating `send`'s
inline mapping). `saveEdit` now keeps the editor open and surfaces the alert on
failure (a block reads "…it may contain blocked content"); `remove` surfaces the
alert; `report` shows a `useToast` success/error (the first feedback report ever
gave). `handleMessage` toasts on failure ("You can’t message this person." for a
block). Errors stay typed end-to-end — no parsing of strings.

## M-5 — Inbox dates rendered in server UTC

`stamp` in the inbox page is server-rendered and called `toLocaleDateString` with
no `timeZone`, so on Vercel it formatted in UTC — a late-evening message showed
the next day's date. Same class as the notifications P2 #8 fix. Set
`timeZone: 'America/New_York'` (a local `DEFAULT_TIME_ZONE` constant; this is a
Virginia Beach community, so ET is the right default). The thread view's
`timeLabel` is client-side and already correct, so only the inbox list needed it.

## M-11 — Hand-rolled button class

The `/players/[id]` "Message" button wrote the canonical `border-border-base …
hover:bg-fg/5` string that `neutralButtonClass` exists to own (AGENTS.md pattern
#11; its docstring even names "Message"). Swapped to `neutralButtonClass('sm')` —
a no-visual-change dedup; the helper already carries `disabled:opacity-50`.

## Deferred (still open in the audit)

- **M-1 — event/group rooms are half-built.** Full backend (RLS, RPCs,
  `list_room_recipients`, inbox routing) but no creation UI and the inbox
  mis-routes them. Needs a product decision: finish (mount event/group panels +
  fix `inboxHref`) or formally defer in ADR 0028 and drop the dead branches.
- **M-3 — Realtime auth token set once, never refreshed.** Long-lived tabs may
  silently stop receiving after JWT expiry. Wire `onAuthStateChange → setAuth`,
  but **verify on dev first** (some supabase-js versions auto-propagate).
- **M-4/7/8/9/10/12** — inbox pagination, broadcast sender card ("Member"
  fallback), load-earlier scroll anchor, blocked-state banner, text-message rate
  limit, and the still-absent chat e2e (which would also cover M-3's verification).
