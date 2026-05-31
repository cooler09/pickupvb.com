# Community award voting — best clip / biggest fail (2026-05-30)

## Context

Follow-up to the event/profile media bundle ([ADR 0024](../adr/0024-event-and-profile-media.md),
[journal](2026-05-30-bundle-event-profile-media.md)), which shipped clips but
deferred the "fun award" the user originally asked for. This bundle adds
per-event community voting on clips. Scope locked with the user: **fixed two
categories** (🏆 Best clip, 💀 Biggest fail), **clips only** are votable,
**live running tally** (no reveal window), **real accounts only**, one vote per
category per event (changeable/retractable).

## Decisions

- **Votes are a separate table + repo methods, not part of the `MediaPost`
  aggregate** — same call as reports. A vote has no state machine; the only
  domain rule is "an active clip is votable," which lives in
  `MediaPost.assertVotable()`. Extended `MediaPostRepository` (castVote /
  retractVote + awards in the event read model) rather than adding a `Vote`
  aggregate (would be a no-behaviour layer — AGENTS.md playbook item 4).
- **Public leaderboard via an aggregate view, private ballots via RLS.**
  `media_post_vote_counts` exposes `(event_id, post_id, category, votes)` only —
  no voter ids — and is `security_invoker = false` **on purpose**: it must read
  all ballots to tally. `security_invoker = true` would collapse counts to the
  viewer's own vote (RLS on the base table is "own ballots only"). This is the
  inverse of the usual "invoker = safer" instinct, so it's commented in the
  migration.
- **One vote per category = a unique key + upsert.** `(event_id, category,
voter_user_id)` unique; `castVote` upserts on it (voting another clip moves
  the vote), `retractVote` deletes. The toggle logic (click your current pick →
  retract; click another → move) lives in the UI, which knows `viewerVotes`.
- **Awards ride on the existing `listForEvent` read model**, not a new query.
  `EventMediaReadModel.awards` carries `counts` (per post id) + `viewerVotes`, so
  the leaderboard is a pure client-side derivation (sort clips by count) and the
  vote chips on each card read the same payload — no extra round-trip.
- **Vote actions revalidate only the (dynamic) media page.** Votes don't touch
  the cached `getEventMediaSummary`, so no `updateTag(eventCacheTag)` — unlike
  the media mutators. Documented inline so nobody "fixes" it by adding one.

## Changes

- **domain** `media/award.ts` (`AwardCategory`, `AWARD_CATEGORIES`,
  `isAwardCategory`); `MediaPost.assertVotable()`; `MediaPostRepository` gains
  `castVote`/`retractVote` + `EventAwards` on `EventMediaReadModel`. Tests in
  `media-post.test.ts`.
- **application** `CastVoteCommand`/`RetractVoteCommand` + handlers (category
  validation, event-match check, `assertVotable`); fake repo + 5 new cases in
  `media-post.handler.test.ts`.
- **infrastructure** `castVote` (upsert), `retractVote`, and `loadEventAwards`
  (counts view + viewer ballots) merged into `listForEvent`.
- **migration** `20260821000200_media_post_votes.sql`: table, counts view, RLS.
- **composition root** `getMediaHandlers()` gains `castVote`/`retractVote`.
- **web** `media/actions.ts` (`voteFromForm`/`retractVoteFromForm`); vote chips
  on clip `MediaCard`s; `awards-leaderboard.tsx`; `awards` threaded through
  `MediaSections`; leaderboard rendered on the media page.

## Patterns observed

- **A Postgres aggregate view that must bypass RLS uses `security_invoker =
false` (the default), and that's the correct, intentional choice for public
  counts over private rows.** Don't reflexively flip views to invoker — check
  whether the view's job is "show each user their slice" (invoker) or "show
  everyone the aggregate" (definer/owner).

## Verify

- Domain typecheck **clean**; media/award tests green (34 domain + 17
  application). All changed files (domain/app/infra/web) lint clean.
- **Full `pnpm typecheck`/`build` currently fails — but only on the in-progress
  standalone-brackets work** (`bracket.handler.ts`, `supabase-bracket-repository.ts`
  haven't caught up to the `ownerUserId`/nullable-`eventId` change on `Bracket`).
  Zero errors in any media/award/vote file. Re-run the full quad once the bracket
  bundle compiles.
- `db:migrate`/`gen:types` not run locally (Docker down); CI applies on deploy.

## Follow-ups

- **Migration version collision fixed:** the votes migration was renamed
  `20260821000000 → 20260821000200_media_post_votes.sql` to clear the
  same-version clash with `20260821000000_standalone_brackets.sql`.
- Remaining ADR 0024 deferrals stand: clip→match attachment (`match_id`
  reserved) and provider-API live detection.
- Possible polish: surface the #1 clip per category with a 🏆/💀 badge on its
  card, and/or a tiny "winner" line on the event-detail media link once an event
  is over.
