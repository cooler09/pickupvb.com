# 0024. Event & profile media — external videos, livestreams, and clips

- **Status:** Accepted
- **Date:** 2026-05-30
- **Relates to:** [ADR 0001 — Hexagonal architecture with CQRS-lite](0001-hexagonal-cqrs.md), [ADR 0002 — Supabase Auth (anonymous-auth posture)](0002-supabase-auth.md), [ADR 0004 — Typed domain errors](0004-typed-domain-errors.md)

## Context

Video and livestreaming are central to the volleyball community — people post
match recordings, clips/highlights, and livestream games. The platform had **no
media concept**. We want users to attach videos and streams to events and to
their profiles, surface a per-event livestream list with a host-selected
featured stream, and grow a profile "highlight reel" — **without cluttering the
event detail page** for people who only want event logistics.

We deliberately **host nothing**: a media post points at an external URL
(YouTube, Twitch, Instagram, TikTok, Facebook, or any other https link). This
sidesteps storage, transcoding, CDN, and copyright-takedown burdens, and matches
where the community already publishes.

The existing **community-listings** aggregate already solves the hard parts of
"users submit a thing that points at an external URL": an `active/hidden/removed`
moderation lifecycle, a report table with an auto-hide threshold trigger, a
short-code trigger, per-user rate limiting, and anonymous-auth RLS. Media is the
same shape, so we mirror it rather than invent a new pattern.

## Decisions

- **New `MediaPost` aggregate, modeled on `CommunityListing`** — not a column on
  events. Media has its own lifecycle, moderation, and ownership (the submitter,
  who may not be the host), so it earns an aggregate. Chose a single aggregate
  with a `kind` (`live_stream | match_video | clip`) over three aggregates
  because they share every field and invariant; the only kind-specific state is
  live-stream timing (`liveStartedAt/liveEndedAt`) and the `featured` flag.

- **Provider classification lives in an `ExternalVideoUrl` value object; embed
  URLs are built in the web layer.** The VO parses the URL into
  `provider + externalId + subtype` (pure, framework-free, testable). The web
  layer constructs **first-party** embed srcs (`youtube-nocookie.com/embed/{id}`,
  `player.twitch.tv/?...`) from that — we **never iframe a raw user URL**. Only
  YouTube and Twitch (clean embeds) get an iframe; Instagram/TikTok/Facebook/
  other render a "Watch on …" link card. Rejected an oEmbed-fetch approach for
  v1 (network dependency, rate limits, caching complexity) — link cards are
  enough.

- **Twitch `parent` is the known deploy-domain set, not the request host.**
  Twitch embeds require `parent=` to match the page host. We pass all our
  domains (`pickupvb.com`, `www.`, `dev.`, `localhost`) as repeated params so the
  embed works without calling `headers()` — which would force the ISR-cached
  `/players/[id]` profile page dynamic.

- **"One featured live stream per event" is a DB invariant + a host-gated RPC,
  not an aggregate invariant.** It's a cross-row constraint, so a partial unique
  index (`where featured and kind='live_stream' and status='active'`) enforces
  it, and `feature_event_stream(event_id, media_id)` (SECURITY DEFINER, gated on
  `is_event_host`) does the atomic clear-others-then-set. This follows the
  `record_bracket_match_result` precedent (AGENTS.md gotcha #8). Feature-OFF is a
  single-row update through the aggregate's `unfeature()`.

- **Any signed-in _real_ user can post; moderation is report + host/admin
  hide/remove.** Maximizes community content. RLS gates INSERT on
  `is_anonymous = false` (ADR 0002), the report table auto-hides at 3 reports,
  and UPDATE/DELETE allow submitter ∪ `is_event_host` ∪ `is_platform_admin`. The
  after-report trigger is **SECURITY DEFINER** (the one divergence from
  community-listings, which counts on the admin client) because media reports are
  filed on the user-scoped client — without DEFINER the reporter's RLS would
  filter the counter update on someone else's post.

- **The event detail page footprint is one conditional pill + one link.** All
  browsing/posting lives at `/events/[id]/media`. The detail page shows a
  "🔴 Live now" pill in the hero only when a stream is live, and a compact
  "🎬 Videos & clips (N)" link near the bottom, fed by a cached, viewer-
  independent `getEventMediaSummary` side-load. This honors the "respect the
  event page" constraint — a details-only viewer sees at most one line.

- **Voting awards (best clip / biggest fail) are deferred.** They need real-
  account-gated, anti-ballot-stuffing design and are isolated to a later bundle.

## Consequences

- A clip posted to an event also appears on the submitter's profile — profiles
  become highlight reels for free (`listForProfile` returns all of a user's
  posts).
- `match_id` is reserved (nullable, no FK) for Phase 2 "attach a clip to a
  specific match"; match identity is split across bracket/league tables, so the
  FK waits until there's a single target.
- Live "is it live now?" is a manual + heuristic signal (`liveStartedAt` set,
  `liveEndedAt` null) — no provider-API polling. A host/streamer ends the stream
  explicitly; an abandoned stream stays "live" until then. Acceptable for v1.
