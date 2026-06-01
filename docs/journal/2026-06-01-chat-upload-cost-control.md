# R-2 media cost-control — chat-attachment upload cap (2026-06-01)

## Context

Third greenlit lever from the monetization re-eval. R-2 was filed as "tier media
storage by volume — generous free photo quota, Pro = higher limits." Tracing the
code before proposing numbers showed the premise was wrong:

- **ADR 0024 media (videos/clips/streams) = external links** — the platform
  "hosts nothing," so it costs ≈$0. Metering it taxes free community content for
  no savings.
- **Avatar / hero / sponsor logo = one upload each** (10 / 8 / 4 MB). No volume
  to tier.
- **Chat attachments = the only real byte-volume surface** (10 MB × 10/message,
  image-only, bucket-enforced) — but chat is a **community surface** (DMs / team
  rooms). Our do-not list forbids a chat/DM paywall, and the buyer persona is the
  host, not the chatter.

So a Pro media quota had no community-safe home. Presented two paths; the user
chose **Path A — cost-control, not monetization.**

## Decisions

- **Bound cost universally, don't paywall.** The "cover server costs" half of the
  ask is served by limits + retention applied to everyone, not a tier gate.
  Shipped a per-user **chat-attachment upload cap**; left media otherwise
  free/uncapped-by-tier.
- **Cap attachment-bearing _messages_ per day, not images.** ≤ 40 image messages
  / rolling 24h per user. Counting messages keeps it on the existing 1-per-call
  fixed-window `consumeRateLimit` — **no migration, no RPC change** (the email
  throttle shares that RPC; not worth the risk for a runaway control). Each
  message already caps at 10 images, so 40 messages bounds volume generously
  (legit users send 0–5 image messages/day) while stopping a runaway. Text chat
  is never throttled.
- **Reuse the fail-open limiter.** `consumeRateLimit` already fails open on a DB
  blip, so the cap never blocks a real send during an outage — correct posture
  for a cost-control (vs. security) limit.
- **Hash the user dimension.** Extended `rateLimitKey` from `'ip' | 'email'` to
  add `'user'` (trimmed, hashed+salted) so `rate_limits.key` doesn't enumerate
  active account ids — same privacy posture as the email/IP keys (privacy P3 #10).
- **No ADR.** ADR 0014 governs _monetization_ levers; Path A is explicitly not
  monetization, so no amendment — the audit + this entry are the record.

## Changes

- [apps/web/src/lib/rate-limit-key.ts](../../apps/web/src/lib/rate-limit-key.ts)
  — `rateLimitKey` dimension union gains `'user'` (+ test case in
  [rate-limit-key.test.ts](../../apps/web/src/lib/rate-limit-key.test.ts)).
- [apps/web/src/app/\_actions/chat-actions.ts](../../apps/web/src/app/_actions/chat-actions.ts)
  — `sendChatMessage` consumes the limiter for attachment-bearing sends; new
  `rate_limited` `ChatError`; `CHAT_ATTACHMENT_MESSAGES_PER_DAY = 40`.
- [chat-actions.test.ts](../../apps/web/src/app/_actions/chat-actions.test.ts)
  — new (text unthrottled; image send consumes + sends when allowed; over-cap
  rejects without calling the handler).
- [conversation-view.tsx](../../apps/web/src/components/conversation-view.tsx)
  — `rate_limited` → "You've shared a lot of photos today. Please try again later."
- Records: monetization audit R-2 (premise correction + Path A shipped) + log.

## Patterns observed

- **Trace the cost surface before designing a quota.** Two of the three things
  R-2 named as "media to meter" cost nothing (external links) or are singular
  (one avatar/hero/logo). Had the audit driven a build directly, we'd have
  paywalled free content or a community chat surface. Same lesson as the R-1
  "already built" correction — verify against code before grading a finding.

## Follow-ups

- Path B (Pro event photo gallery) stays open — only build if hosts ask for photo
  uploads; it's a feature, not a quota.
- R-1 Phase 6 (`score-live` Playwright spec) remains the last open lever.
- If a per-_image_ (not per-message) budget is ever wanted, add a `p_count` arg to
  `consume_rate_limit` (drop+recreate with `default 1`) and consume
  `attachments.length`.
