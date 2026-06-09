# 2026-06-08 — Live chat sender cards (M-7): stop the "Member" fallback sticking

Closes **M-7** from the chat-engine deep-dive
([notifications-messaging.md](../audits/notifications-messaging.md)). Live chat
delivery rides `realtime.broadcast_changes`, which emits the **raw `messages` row**
— only `sender_id`, no joined sender card (an explicit ADR 0028 consequence). So a
live message from anyone not in the panel's seeded `participants` roster rendered
as **"Member"** with no avatar.

Two compounding bugs made it worse than a transient blank:

1. `recordToView` resolved unknown senders to the literal string `'Member'`.
2. `onWrite` then called `learnSenders` on that just-built view, **caching
   `'Member'`** for the sender — so every later message from them also hit the
   cache as 'Member', sticky for the whole session until a server-resolved page
   (reload / load-earlier) overwrote it.

Phase 5 (event + group rooms) widened the exposure: event rooms have large, churny
rosters, so "someone who joined after page load posts a live message" is common.

## Fix: client-side enrichment from `profiles_public`

The ADR offered two options — embed a sender card in the broadcast payload, or
fetch the missing card client-side and patch it in. Chose the **client fetch**:

- The payload embed needs a migration (rework `broadcast_message` to a custom
  join + `realtime.broadcast`) **and** changes the client's payload-parsing
  contract, and it's deploy-unverifiable locally (triggers/Realtime). High risk
  for a P3 polish.
- The client fetch is pure app code, works uniformly for team/event/group rooms
  **and** DMs, and `profiles_public` is exactly the sanctioned public display-card
  projection (pitfall #13 — granted to `authenticated`, never base `profiles`).

In [conversation-view.tsx](../../apps/web/src/components/conversation-view.tsx):

- **`recordToView` no longer caches the fallback.** An unknown sender resolves to
  `senderName: null`, which the existing render already shows as the 'Member'
  fallback — but nothing is written to the cache, so it can't stick.
- **New deduped `ensureSenderCard(id)`** (called from `onWrite`): skips if the id
  is already cached or a fetch is in flight; otherwise reads
  `profiles_public.{display_name, avatar_url}` once, caches the real card, and
  `setMessages`-patches **every** already-rendered row from that sender (so a
  burst that arrived before the fetch resolved all update together).
- The viewer + seeded roster are pre-cached, so this fires only for genuinely
  unknown senders — typically a single fetch per newly-active participant.

`learnSenders` stays for the server-resolved paths (initial page + load-earlier,
which carry real names); it's just no longer fed broadcast views.

## Follow-ups

- The **broadcast-payload embed** remains a possible future optimization (saves
  the per-new-sender round-trip), if a migration to that path is ever worthwhile.
- The bell still deep-links rooms to `/messages/{id}`, whose page seeds only the
  viewer in `participants` — so room messages opened there lean on this same
  enrichment for everyone else. That's now handled (it's the same component), but
  it's another reason the eventual payload embed would be cleaner.
- Remaining chat backlog is all P3: M-4 (inbox pagination), M-8 (load-earlier
  scroll anchor), M-9 (blocked-state banner), M-10 (text-message rate limit),
  M-12 (chat e2e).
