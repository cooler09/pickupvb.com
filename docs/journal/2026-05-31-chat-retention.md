# Chat retention — attachment orphan sweep + soft-deleted message scrub (2026-05-31)

## Context

Privacy re-audit finding **#14** (P2): the chat surface (shipped 20260824
messaging, 20260826 attachments) had no retention policy. Two sub-gaps:

1. The private `chat-attachments` Storage bucket had no orphan sweep — the
   attachments migration explicitly deferred it ("a follow-up cron, mirroring
   hero-images"). Abandoned uploads (image picked, message never sent) and
   removed/scrubbed messages leaked storage objects forever.
2. `messages_update` soft-deletes by setting `deleted_at`; the read path already
   tombstones (returns `body:''` / `attachments:[]`), but the original `body` +
   `attachments` lingered on disk — readable by a platform admin or a future raw
   export. Free-text chat is exactly where people paste phone numbers / addresses
   / payment details, so this is the same unbounded-PII concern that put
   `notification_outbox` at P1, scoped to chat.

This was the last open item across the entire privacy backlog. It primarily
lives in [data-lifecycle.md](../audits/data-lifecycle.md) (entity-by-entity
retention), so this bundle also added the chat tables to that §1 inventory.

## Decisions

- **Scrub-in-place over hard-delete for soft-deleted messages.** The audit
  offered (a) null `body`/`attachments` keeping the tombstone, or (b) hard-delete
  the row. Chose (a): the read path already renders deleted rows empty, so
  scrubbing is observable-behaviour-neutral while the tombstone placeholder stays
  in the conversation. Hard-delete would silently vanish the "this message was
  deleted" marker and risk dangling references.
- **Relaxed `messages_nonempty` rather than special-casing the scrub.** The
  "a message must carry content" invariant should only bind _live_ rows. New
  CHECK: `deleted_at is not null OR length(btrim(body))>0 OR
jsonb_array_length(attachments)>0`. Live inserts are unchanged (`sendChatMessage`
  already rejects empty body+no-attachment before insert), so only the scrub job
  ever produces an empty row, and only on a tombstone.
- **Exact-path liveness, not a LIKE-wildcard.** Hero/sponsor walkers match a
  cache-busted _public URL_ (`logo_url like '%/'||name||'?%'`). Chat is private:
  `conversation-view.tsx` stores the **bare** object path
  (`{conversationId}/{viewerId}/{uuid}.{ext}`) in `messages.attachments[].path`,
  no `?t=` suffix, no URL prefix. So liveness is an exact `o.name = path`
  membership test over the unnested attachments — simpler and not fooled by the
  cache-buster trap that bit the hero walker (20260819).
- **No blanket message TTL.** Live DM/room history is deliberately kept — only
  soft-deleted rows are scrubbed. A blanket TTL on all messages would delete
  history users expect to persist (DMs especially).
- **One migration, two crons, ordered.** Scrub at 06:30 UTC de-references aged
  tombstones, orphan sweep at 06:45 UTC reclaims the now-unreferenced objects the
  same night. Both clear of the 04:00–05:00 retention purges and 06:00/06:15
  hero/sponsor/push sweeps.

## Changes

- [supabase/migrations/20260829000000_chat_retention.sql](../../supabase/migrations/20260829000000_chat_retention.sql)
  (new) — relax `messages_nonempty`; `public.purge_chat_attachment_orphans(grace)`
  SECURITY DEFINER walker + `chat_attachments_purge_orphans` daily cron;
  `messages_scrub_soft_deleted_30d` daily cron.
- [docs/audits/privacy.md](../audits/privacy.md) — #14 → resolved, re-audit
  summary (`Remaining backlog: none`), remediation-log entry.
- [docs/audits/data-lifecycle.md](../audits/data-lifecycle.md) — top status
  block; chat tables added to §1 Messaging inventory; backlog row P3 #8 (shipped).
- [docs/audits/README.md](../audits/README.md) — privacy + data-lifecycle index
  rows updated.

No app-code changes: the migration touches only a CHECK, two functions, and two
cron rows, so `gen:types` output is unaffected and typecheck is untouched.

## Patterns observed

- **Storage orphan walkers now form a family of three** (hero, sponsor, chat),
  all SECURITY DEFINER + `search_path=''` + the `storage.allow_delete_query` GUC
  escape hatch. The differentiator is the liveness join: public URL with
  cache-buster (LIKE-wildcard) vs. private bare path (exact match). Worth keeping
  in mind when the next bucket lands — check whether the row stores a URL or a
  path before cloning the LIKE.
- **A "must carry content" CHECK and an in-place scrub conflict.** Any future
  "blank the PII but keep the tombstone" retention job needs the invariant to
  exempt soft-deleted rows up front. Cheap to do at table-creation time.

## Follow-ups

- Live two-user chat verification against dev (Realtime + RLS) is still the
  standing gap noted in the chat initiative — unrelated to retention, but the
  scrub's re-broadcast of an aged tombstone (the `broadcast_message` trigger
  fires on the scrub UPDATE) is only smoke-tested locally, not observed on a live
  subscriber. Harmless by design (subscriber re-renders the same empty
  tombstone); confirm opportunistically when chat e2e lands.

## Verify

Standard quad. Migration also validated against the local DB: live-empty insert
still rejected by `messages_nonempty`; a 40-day-old soft-deleted row scrubs to
empty body/attachments; the walker deletes an unreferenced object while retaining
one pinned by a live message (2 → 1).
