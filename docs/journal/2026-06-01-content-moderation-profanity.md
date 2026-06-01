# Content moderation — profanity filtering across UGC surfaces (2026-06-01)

## Context

User request: the app's community-driven sections needed a profanity filter —
public surfaces censored, private DMs only blocked for extreme language. Until
now the only moderation was **reactive** (report → auto-hide at 5 reports;
ADR 0024 / 0028). This bundle adds the **proactive** front line designed in
[ADR 0030](../adr/0030-content-moderation-profanity.md) (Proposed → now wired)
and implements the two product decisions the user locked in: **mask-at-write**
for public content, and **hard-block-at-creation** for identity/name fields.

## Decisions

- **Chose a pure domain service over a per-call AI moderation hop.** `ContentModeration`
  ([content-moderation.ts](../../packages/domain/src/moderation/content-moderation.ts))
  wraps `obscenity` (TS, MIT, zero deps) — synchronous, in-process, nothing
  leaves the system. AI moderation stays deferred to an off-hot-path tier
  (ADR 0030). Safe to call on the chat send path, which deliberately avoids
  extra round-trips.
- **Three policies, not two.** Added `'block-profane'` to the ADR's
  `'mask'` / `'block-extreme'` after the user chose hard-block for names. A
  masked team name reads badly ("The \*\*\*\*ers") and a name is picked once, so
  identity fields reject **any** profanity (Tier-A or Tier-B) at creation rather
  than censor. Content fields mask Tier-A; DMs block only Tier-B.
- **Tier-B = curated subset of the dataset's own patterns, not hand-authored.**
  `EXTREME_WORDS` filters `englishDataset` by `originalWord` to the identity-hate
  set. Reason: the recommended transformers collapse duplicate characters, so a
  hand-written pattern with a doubled letter (`gg` in `nigger`/`faggot`) silently
  fails to match collapsed input. Reusing the dataset's patterns inherits its
  leetspeak/collapse-aware matching. (This bit the first prototype; see Patterns.)
- **Mask-at-write for chat rooms; chose to thread `ConversationKind` end-to-end**
  rather than store raw + mask on read. The committed ADR put room kinds in the
  `'mask'` bucket and DMs in `'block-extreme'`, so `Message.compose/edit` take a
  policy derived from the conversation kind. The kind is set server-side at the
  render site (`team-chat-panel` → `'team'`, `/messages/[id]` → `conv.kind` from
  the RLS-gated row). The mask-vs-not lever is cosmetic (Tier-B is blocked under
  _every_ policy and defaults to the stricter `'mask'`), so passing the kind as
  an action arg carries no security weight — documented inline.
- **Reused `ValidationError`, no new error subclass.** An extreme/profane match
  is bad input at the boundary — exactly `ValidationError`. It already maps to
  400 via [api-helpers.ts](../../apps/web/src/lib/api-helpers.ts) and to
  `'invalid'` in the chat `toChatError`.

## Changes

Domain:

- `moderation/content-moderation.ts` — `'block-profane'` policy + `maskPublicText`
  / `assertCleanName` helpers; tests (16).
- Names → `assertCleanName` (block): `UserProfile.create`/`editDetails`,
  `Group.assertName`, `Team.create`, `VolleyballEvent.create` (title).
- Content → `maskPublicText` (mask-at-write): `MediaPost` + `CommunityListing`
  title & description (create + update), `Group` description, `VolleyballEvent`
  description.
- `Message.compose`/`edit`/`assertContent` take a `ModerationPolicy` (default
  `'mask'`); tests pin room-mask vs DM-allow vs Tier-B-block on both.
- Wiring-pin tests added to `team.test.ts` (name hard-block) and
  `media-post.test.ts` (title mask).

Application:

- `SendMessageCommand` / `EditMessageCommand` gained `conversationKind`
  (default `'team'`); handlers map `dm → block-extreme`, else `mask`.

Web:

- `chat-actions.ts` `sendChatMessage`/`editChatMessage` take `kind`;
  `ConversationView` gained a `kind` prop threaded to both actions (+ effect
  deps); the two render sites pass it.

Dependency: `obscenity@0.4.6` added to `@pickupvb/domain`.

## Patterns observed

- **`obscenity` collapses duplicate characters in the input via the recommended
  transformers.** A blacklist pattern containing a literal doubled letter (`zz`,
  `gg`) will never match input whose run collapses to a single char. Author
  patterns single-lettered, or — better — reuse `englishDataset`'s patterns.
  The `pattern\`…\``tag also treats`${…}`as AST nodes, not text; use`parseRawPattern(str)` for a dynamic literal.

## Follow-ups

- **Ad-hoc / walk-in team names** (`RegisterAdHocTeamCommand`,
  `RegisterWalkInTeamCommand`) are user-set public names not yet screened — they
  don't flow through `Team.create`. Apply `assertCleanName` at those handlers.
- **Own/expand `EXTREME_WORDS`** as a reviewed content list; grow the
  false-positive allowlist as real names trip it.
- **Event edit path** isn't modeled on the aggregate (title/description update is
  raw); screening currently lands at `create` only. Hook the edit action or
  promote the update into the aggregate.
- **AI escalation tier** (off hot path) — re-scan reported content before the
  5-report threshold (ADR 0030).

## Verify

Standard quad green (typecheck / lint / test / build). New/changed tests:
domain 446 pass (content-moderation 16, message 20, team 33, media-post 15).
Live chat masking (Realtime broadcast of the masked row) is **not** exercised by
the quad — verify on dev that a room message with profanity renders censored and
a DM does not.
