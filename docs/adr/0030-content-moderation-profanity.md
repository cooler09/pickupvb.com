# 0030. Content moderation — profanity filtering across community surfaces

- **Status:** Accepted (implemented 2026-06-01)
- **Date:** 2026-05-31
- **Relates to:** [ADR 0024 — Event & profile media](0024-event-and-profile-media.md)
  (the report → auto-hide UGC template this builds on), [ADR 0028 — Chat
  messaging](0028-chat-messaging.md) (the `conversations.kind` public/private
  discriminator and the `Message` write aggregate), [ADR 0004 — Typed domain
  errors](0004-typed-domain-errors.md) (extreme matches throw `ValidationError`).

## Implementation decisions (2026-06-01)

Two choices refined the proposal at build time (narrative:
[journal 2026-06-01](../journal/2026-06-01-content-moderation-profanity.md)):

1. **Mask-at-write** for public content (the stored value is the censored
   string) — resolving the "Open decision — mask at write vs. read" below.
2. **Names hard-block at creation** rather than mask — a third policy,
   `'block-profane'`, rejects **any** profanity in identity fields (profile
   display name, group / team name, event title). Content fields still mask;
   DMs still block extreme only. This overrides the "mask everything" framing in
   the original "Hook the existing validation chokepoints" bullet for names.

## Context

The product has several community-driven, user-generated-text surfaces and no
**proactive** content filter — nothing inspects text on the way in. Today the
only moderation is **reactive**: a report table plus an after-report trigger
that auto-hides a row at five reports, cloned across three aggregates —
`media_posts` ([media-post.ts](../../packages/domain/src/media/media-post.ts)),
`community_listings`
([community-listing.ts](../../packages/domain/src/community-listings/community-listing.ts)),
and `messages`
([message.ts](../../packages/domain/src/messaging/message.ts), threshold in
`messages_after_report()`). That backstop only fires _after_ a human flags
content and _after_ it has already been seen.

We want a first line of defense with two distinct postures:

- **Public surfaces should be censored** — common profanity masked so casual
  swearing doesn't surface on pages any visitor can read.
- **Private messages (DMs) should be permissive** — adults can swear at each
  other, but **extreme** content (slurs targeting protected classes, sexual
  content involving minors, credible threats of violence) is never acceptable
  and must be blocked even in a 1:1 thread.

Forces at play:

1. **A clean public/private discriminator already exists.** ADR 0028 gave us
   `ConversationKind = 'team' | 'event' | 'group' | 'dm'`
   ([conversation.ts](../../packages/domain/src/messaging/conversation.ts)). A
   `dm` is private; the three room kinds are members-only but effectively
   public within a community. Every other text surface (titles, descriptions,
   profile bio, group/event/team names) is fully public.
2. **The chat send path is deliberately round-trip-free.** `Message.compose`
   leaves conversation-access checks to RLS rather than pre-flighting them
   precisely to avoid doubling DB round-trips per message
   ([message.ts](../../packages/domain/src/messaging/message.ts), the
   `compose` doc-comment). Any per-message moderation check must not reintroduce
   a network round-trip on that hot path.
3. **The repo is privacy-conscious.** `docs/audits/privacy.md` and the PII
   posture (base `profiles` is owner-only RLS; chat attachments live in a
   private bucket) mean shipping DM content to a third-party moderation API is a
   posture shift that should be a conscious, separate decision — not the default.
4. **Validation already has chokepoints.** Each aggregate normalizes its text in
   one place — `normalizeTitle` in
   [media-post.ts](../../packages/domain/src/media/media-post.ts) and
   [community-listing.ts](../../packages/domain/src/community-listings/community-listing.ts),
   `assertContent` in [message.ts](../../packages/domain/src/messaging/message.ts),
   and the equivalents on `UserProfile` / `Group`. A filter wants to hook these,
   not sprinkle checks across server actions.

## Decision

Introduce a **proactive, two-tier, in-process profanity filter** as a pure
domain service, layered _in front of_ the existing reactive report system
(which stays as the backstop). AI/LLM moderation is explicitly **deferred** and,
when added, runs **off** the hot path.

### Two-tier severity model

- **Tier A — common profanity** (`fuck`, `shit`, …): **masked** on public
  surfaces, **allowed** in DMs.
- **Tier B — extreme** (slurs targeting protected classes, sexual content
  involving minors, credible violent threats): **blocked everywhere**, DMs
  included, by throwing `ValidationError` ([ADR 0004](0004-typed-domain-errors.md)) —
  no new error subclass.

### A pure domain service, not scattered checks

A framework-free service under `packages/domain/src/moderation/`, unit-tested
like every other domain rule, exposing a single screen entry point keyed by a
policy:

```ts
screen(text, policy): // policy = 'mask' | 'block-extreme'
//  'mask'          → { cleaned, hadProfanity }      // public surfaces
//  'block-extreme' → text unchanged, or throws ValidationError  // DMs
```

`'mask'` runs both tiers: it throws on a Tier-B match and masks Tier-A.
`'block-extreme'` runs Tier B only. The service owns **two** matchers — a full
profanity dataset (mask) and a curated extreme subset (block) — plus an
**allowlist** escape hatch from day one (see Consequences).

### Library, not hand-rolled regex

Wrap [`obscenity`](https://www.npmjs.com/package/obscenity) (TypeScript-native,
MIT, zero runtime deps). It defeats the obfuscation that kills naïve filters —
leetspeak, interstitial spacing, character substitution (`f.u.c.k`, `phuck`,
`sh1t`) — and ships a `TextCensor` for masking plus configurable datasets so the
two tiers are two matchers over one library. The dependency lands in
`@pickupvb/domain`, keeping the layer framework-free (a wordlist matcher is not
a framework).

### Hook the existing validation chokepoints

The service is called from the normalizers that already exist — no new call
sites in actions:

- **Chat:** `Message.compose` / `Message.edit` receive the conversation `kind`;
  `dm` → `'block-extreme'`, the three room kinds → `'mask'`. The room policy
  blocks Tier B and records masked output (see the write-vs-read note below).
- **Media posts / community listings / profile / group / event:** `'mask'` in
  `normalizeTitle` and the description/name normalizers.

### Reactive report system stays as the backstop

The Tier-A/B wordlist cannot catch context ("that match was a bloodbath" is not
a threat) or novel terms. The report → auto-hide triggers from ADR 0024/0028 are
unchanged and remain the human-in-the-loop safety net for everything the
wordlist misses.

### AI moderation is deferred, and never on the hot path

When the reactive backstop proves insufficient, an AI tier may be added, but
only **off** the send path: an async re-scan of _reported_ content to
auto-escalate, or a batch sweep — never a per-message synchronous call. The
existing `@anthropic-ai/sdk` dependency makes this reachable later; this ADR
does not commit to it.

## Consequences

- **Positive:** a real first line of defense with zero latency, zero per-message
  cost, and **nothing leaving the system** — the wordlist runs in-process, so
  the chat hot path keeps its no-round-trip property and DM content stays
  private. The masking/blocking logic is one unit-tested domain service, not
  logic smeared across actions and SQL.
- **Open decision — mask at write vs. read.** Write-time masking (persist the
  censored string) is simpler to read back but **lossy** — the original is gone
  for appeals or re-tuning the filter. Read-time masking (store raw, mask in the
  projection/display layer) preserves the original and lets the filter be
  re-tuned without reprocessing, but must be applied at _every_ render site.
  Recommendation: **write-time for lossy-tolerant short fields** (titles,
  names) and **read-time for chat** (store raw, mask on display) so moderators
  and the report flow still see the true body. This choice is deliberately left
  to the implementing bundle.
- **False positives are real (the Scunthorpe problem).** Surnames ("Dick",
  "Cockburn"), place names, and words like "assassin" trip a substring filter.
  An **allowlist is mandatory from day one**, and the masking posture (mask, not
  block) on public surfaces means a false positive degrades gracefully to a
  censored-but-still-posted string rather than a rejected submission.
- **English-centric.** `obscenity`'s recommended dataset is English; non-English
  profanity passes until additional datasets are added. The reactive backstop
  covers the gap.
- **Not exercised end-to-end by build/typecheck/test for the wiring** — the
  domain service itself is fully unit-testable (deterministic in → out), which
  is where the coverage should concentrate (per AGENTS.md testing guidance: a
  domain rule earns a `packages/domain` test). The call-site wiring is thin.
- **Reversible:** the service is additive. Remove the calls from the
  normalizers and drop the dependency; no schema change is required if masking
  is done at read time.

## Alternatives considered

- **AI/LLM moderation on the send path** (OpenAI's free moderation endpoint, or
  a Haiku classification via the existing SDK). Context-aware, multilingual,
  severity-scored — genuinely better at the "extreme-only" judgment. Rejected
  for the _synchronous_ path: 200–1000 ms per send is unacceptable on the chat
  hot path, it adds a third-party availability dependency, it sends DM content
  off-system (privacy posture shift), and it _classifies_ rather than _masks_ —
  we'd still need a wordlist to censor. Retained as a **deferred, off-hot-path**
  option (re-scan of reported content / batch sweep).
- **Older wordlist libraries** (`bad-words`, `leo-profanity`). Simpler but
  regex/substring-based and trivially bypassed by the leetspeak/spacing tricks
  `obscenity` is built to defeat. Rejected.
- **Reactive-only (status quo).** Rely solely on report → auto-hide. Rejected as
  the sole mechanism: it only acts after content is posted and seen, which fails
  the "public section should be censored" requirement. Kept as the backstop, not
  the front line.
- **A new `ProfanityError` / moderation `DomainError` subclass.** Unnecessary —
  an extreme match is bad input caught at the boundary, exactly what
  `ValidationError` ([ADR 0004](0004-typed-domain-errors.md)) is for. A new
  subclass would add a status-mapping entry in
  [api-helpers.ts](../../apps/web/src/lib/api-helpers.ts) for no behavioral gain.

## Follow-ups

- **Pick the mask-at-write vs. mask-at-read split** per the recommendation above
  and implement the `ContentModeration` domain service + unit tests (Tier-A
  mask, Tier-B block, allowlist, obfuscation cases) behind no wiring first.
- **Seed and own the Tier-B extreme list.** This is a curated, deliberately
  small, high-precision list — review it as content, not code.
- **Allowlist surface.** Start with a static in-repo allowlist; consider a
  data-driven allowlist if false positives on real names become a support load.
- **Locale expansion** if/when the community grows beyond English.
- **AI escalation tier** (off hot path) — async re-scan of reported content to
  auto-hide before the five-report threshold, reusing the report tables.
- **Decide profanity posture for profile/group/event names** specifically —
  these are identifiers people pick once; a hard block at creation (rather than
  silent masking) may read better than a censored team name.
