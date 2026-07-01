# Public polls — sessionless multi-question responses (2026-07-01)

## Context

Hosts asked for a way to gather quick answers — classically "are you coming?"
posted in a Facebook Messenger group — from people who **don't have, and may
never want, a pickupvb account**. The only public write path we had was guest
RSVP, which mints an anonymous `auth.users` row and requires an email +
Turnstile — far too heavy for "tap a link, tap an answer."

This bundle ships **public polls** (ADR 0041): a host builds a multi-question
poll, shares an 8-char short link (`/p/ABCD1234`), and a total stranger answers
with just a name. It doubles as a growth loop — a pickupvb-branded page in front
of an off-platform audience.

Scope was locked with the user up front (AskUserQuestion): responders are
**sessionless / name-only**; polls are **full multi-question** (single- or
multi-select); respondent-name visibility is a **host toggle** (default on);
a poll is owned by a creator and optionally scoped to an **event XOR a group**;
Phase 1 ships the standalone loop, Phase 2 embeds into event/group pages.

## Decisions

- **`Poll` aggregate models config only; responses live outside it.** Same
  reasoning that keeps `event_attendees` out of `VolleyballEvent` — responses
  are unbounded, arrive sessionlessly, and must be validated in SQL anyway.
  Submission is a **facade-over-RPC**, not a command handler (AGENTS pattern 10);
  there's no aggregate invariant to protect on submit. The aggregate's only tie
  to responses is `replaceQuestions`, which refuses to restructure once any
  response exists (a full-replace cascade-deletes `poll_answers`).
- **The trust boundary is three `SECURITY DEFINER` RPCs, not table RLS.** Config
  - response tables are **not** world-readable — that would let anyone enumerate
    every poll. The public page reads config via `get_poll_config(code)` and the
    tally via `get_poll_results(code)`; the **short code is the capability**.
    Writes go only through `submit_poll_response(...)`, which validates open +
    required + option-belongs-to-poll + single-select-cardinality. Mirrors
    `record_bracket_match_result`, minus the auth gate (anyone may respond — only
    validation, no authorization). `get_poll_results` gates names on the toggle
    **server-side**, so the CDN-cached page can never leak names the host hid.
- **Why not reuse anonymous auth** (guest RSVP): it mints an `auth.users` row and
  demands an email — friction that defeats the point. A signed-in responder is
  still linked by `user_id` (the submit runs on the cookie-scoped server client,
  so `auth.uid()` resolves in the RPC), but never required.
- **Host side runs under RLS** via a per-request `getPollHandlers()` factory on
  the user-scoped client (mirrors `getGroupHandlers`), so creator-only RLS
  (`is_poll_creator`) is the real gate — never the admin-client singleton.
- **Sessionless page stays cacheable:** `/p/[code]` reads only via the anon
  client (no `cookies()`), `revalidate = 60`; the form + cookie token + live
  tally live in a `'use client'` island. "Closed" shown up front is driven by
  `status` (pure — no `Date.now()` in render, pitfall #4); the `closes_at`
  hard-stop is enforced by the RPC and surfaced as a submit error.

## Shape of the change

- **Migration** [20261017000000_polls.sql](../../supabase/migrations/20261017000000_polls.sql):
  five tables (`polls`, `poll_questions`, `poll_options`, `poll_responses`,
  `poll_answers`) + the short-code trigger (reuses `gen_event_short_code()`) +
  RLS + `is_poll_creator` + the three RPCs. `database.types.ts` hand-edited
  (regenerate on next `gen:types`).
- **Domain** `packages/domain/src/polls/` — `Poll` aggregate + value objects +
  `PollWriteStore` / `PollQueries` / `PollRepository` ports.
- **Application** — `CreatePoll` / `UpdatePoll` / `SetPollStatus` / `DeletePoll`
  handlers + the read handlers, wired via `getPollHandlers()`.
- **Infrastructure** — `SupabasePollRepository` (user-scoped, like the group
  adapter).
- **Web** — host `/polls`, `/polls/new`, `/polls/[id]` (dashboard + share/QR via
  the reused `DisplayLinkRow`), `/polls/[id]/edit` (structural edit locked once
  responses exist); public `/p/[code]` + the `PollResponder` island + the
  `lib/polls-public.ts` facade.

## Tests

- Domain `poll.test.ts` — create invariants, close/reopen, structural-edit guard.
- Web unit `polls-public.test.ts` — submit gates on Turnstile + rate limit and
  maps args to the RPC.
- The GDPR export drift-guard flagged `poll_responses` (new `user_id` column);
  classified as BACKLOG with the reasoning (sessionless, creator-only RLS blocks
  a self-read — same shape as `host_subscriptions`).

Quad-green (typecheck / lint / test / build). Migration is deploy-gated (CI
applies it); the responder e2e is authored-but-deferred until dev.

## Follow-ups

- **Phase 2:** "Polls" sections on the event-manage + group pages (deep-link
  `/polls/new?eventId=…` / `?groupId=…` — the ownership plumbing is already in).
- **Phase 3:** analytics events, convert event-poll respondents → RSVPs, notify
  host on new responses, CSV export, cross-visit "your answer" prefill.
- Convert the dashboard delete's `window.confirm` to `ConfirmDialog` (MU-5).
- The edit page shows `closes_at` in UTC wall-clock (v1 caveat — a tz offset can
  appear on re-edit of the optional close time).
