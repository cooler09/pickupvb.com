# 0041. Public polls — sessionless multi-question responses

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

Hosts need to gather quick answers — classically "are you coming?" posted in a
Facebook Messenger group — from people who **do not have, and may never want, a
pickupvb account**. The only existing public write path is guest RSVP, which
mints an anonymous `auth.users` row and requires an email + Turnstile — far too
heavy for "tap a link, tap an answer." We want a poll a host builds and shares by
short link (`/p/ABCD1234`) that a total stranger answers with just a name, and a
result the host reads back. It doubles as a growth loop: a pickupvb-branded page
in front of an off-platform audience.

Decisions confirmed with the maintainer: responders are **sessionless / name
only**; polls are **full multi-question** (each question single- or
multi-select); respondent-name visibility is a **host toggle** (default on);
a poll is owned by a creator and optionally scoped to an **event XOR a group**;
creation happens standalone (`/polls/new`) and — Phase 2 — from event/group pages.

## Decision

### `Poll` is an aggregate that models config only; responses live outside it

`Poll` ([packages/domain/src/polls/poll.ts](../../packages/domain/src/polls/poll.ts))
owns the ordered questions/options and the always-editable metadata (title,
description, close time, name-visibility, open/closed). Its invariants: ≥1
question, ≥1 option per question, valid kind, event/group not both set, and —
critically — **`replaceQuestions` refuses to run once any response exists**,
because the adapter's structural replace is a cascade-delete that would wipe
`poll_answers`.

Responses are **deliberately not in the aggregate**. They arrive sessionlessly,
are unbounded, and must be validated in SQL anyway (the trust boundary), so
loading them all to record one would be the wrong shape — the same reasoning that
keeps `event_attendees` out of `VolleyballEvent`. Response submission is a **thin
lib facade over an RPC**, not a command handler (the sanctioned
facade-over-port shortcut — see AGENTS.md pattern 10); there is no aggregate
invariant to protect on submit.

### The trust boundary is three SECURITY DEFINER RPCs, not table RLS

Config + response tables are **not world-readable** (that would let anyone
enumerate every poll). The public responder page reads config via
`get_poll_config(code)` and the live tally via `get_poll_results(code)` — the
**short code is the capability**. Sessionless writes go only through
`submit_poll_response(code, name, anon_token, answers)`, which validates
poll-open + every-required-answered + option-belongs-to-poll +
single-select-cardinality, then upserts the respondent's row and replaces its
answers. This mirrors the definer-RPC-with-explicit-guard pattern of
[`record_bracket_match_result`](../../supabase/migrations/20260814000100_record_bracket_match_result_rpc.sql),
except there is **no authorization** to enforce (anyone may respond) — only
**validation**. `get_poll_results` gates respondent names on the
`show_respondent_names` toggle server-side, so the CDN-cached public page can
never leak names the host hid.

Why not reuse anonymous auth (the guest-RSVP path)? It mints an `auth.users`
row and demands an email — friction that defeats the whole point for a Messenger
poll. A signed-in responder is still linked by `user_id` as a bonus (the submit
runs on the cookie-scoped server client, so `auth.uid()` resolves inside the
RPC), but it is never required.

### Identity + "change my answer"

A signed-out responder gets a per-poll `pt_<code>` cookie holding a random token;
re-submitting upserts on `(poll_id, anon_token)` (or `(poll_id, user_id)` when
signed in). Spam is bounded by Turnstile + a per-poll/IP rate limit
([lib/rate-limit.ts](../../apps/web/src/lib/rate-limit.ts)) on the submit; the
RPC is the correctness guard.

### Host side runs under RLS

Create/edit/close/delete + the results dashboard go through a per-request
`getPollHandlers()` factory ([apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts))
on the **user-scoped** client, so the creator-only RLS (`creator_id =
auth.uid()`, `is_poll_creator`) is the real gate — never the admin-client
singleton.

## Consequences

- New tables `polls`, `poll_questions`, `poll_options`, `poll_responses`,
  `poll_answers` + three RPCs (migration
  [20261017000000_polls.sql](../../supabase/migrations/20261017000000_polls.sql)).
  Short codes reuse `gen_event_short_code()`.
- A poll's structure is immutable once it has responses — a deliberate
  simplification (protects answer integrity). Metadata stays editable.
- `get_poll_results` is a definer read that must stay name-gated; any future
  "who answered what" public view has to keep the toggle check server-side.
- **Phase 2** wires "Polls" sections into the event-manage and group pages
  (deep-linking `/polls/new?eventId=…` / `?groupId=…`). **Phase 3** follow-ups:
  analytics events, convert event-poll respondents → RSVPs, notify host on new
  responses, CSV export.
- `database.types.ts` was hand-edited for the new tables + RPCs; regenerate from
  the deployed schema on the next `gen:types`.
