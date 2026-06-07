# Community importer: move AI extraction out of the app into a Claude Code skill (2026-06-04)

## Context

The admin community-listing importer (`/admin/community-import`) parsed pasted
Facebook/event text into structured drafts by calling the Anthropic API
server-side (`lib/listing-extract.ts`, Sonnet, `ANTHROPIC_API_KEY`). That put a
paid, runtime API dependency in the hosted app for an occasional admin task.

User request: do the extraction in Claude Code instead — a skill that turns
Facebook events into a JSON file — and have the website accept that JSON as a
plain upload. This removes the app's Anthropic dependency entirely.

## Decisions

- **Replaced the in-app parse step with a JSON upload; did not keep both.**
  Chose replace over keep-both because the only reason to keep the paste→Claude
  path was the API key we're trying to shed. The `importAction(drafts)` server
  action already accepted `ListingDraft[]`, so the upload feeds the _exact_ same
  pipeline (geocode → timezone → Zod → create) — only the input source changed.
- **The skill leans on the Claude Code session, not a separate key.** The
  extraction model is the agent running the skill, so neither the app nor the
  skill needs `ANTHROPIC_API_KEY`. Net: one fewer secret to manage, no per-import
  cost on the web side.
- **Extracted `ListingDraft` + `coerceDraft` into a framework-free
  `lib/listing-draft.ts`** (no `server-only`, no SDK) so the client importer can
  sanitize an uploaded file before handing drafts to the server action. Added
  `parseDraftsJson()` there as the friendly first gate (clear messages on bad
  JSON / non-array / no usable titles); the server still re-validates every field
  with Zod, so the client gate is convenience, not trust.
- **Skill input is URL-with-paste-fallback.** Tries `WebFetch` per URL, but the
  SKILL.md is explicit that Facebook is usually login-walled/JS-rendered and to
  ask the user to paste the page text rather than guess. The realistic value is
  _structuring_, not _scraping_ — FB has no usable public events fetch.
- **Tolerate both `[...]` and `{ "listings": [...] }`** in `parseDraftsJson` —
  the bare array is what the skill emits, the envelope matches the old extractor
  tool shape, costs nothing to accept.

## Changes

- `apps/web/src/lib/listing-draft.ts` — new, framework-free: `ListingDraft`,
  `coerceDraft`, `parseDraftsJson`.
- `apps/web/src/lib/listing-draft.test.ts` — new: coercion + JSON-parse edge
  cases (invalid JSON, non-array, envelope shape, title filter).
- `apps/web/src/lib/listing-extract.ts` + `listing-extract.test.ts` — **deleted**
  (the only `@anthropic-ai/sdk` consumer).
- `apps/web/src/app/admin/community-import/actions.ts` — dropped `parseAction` /
  `ParseResult` / the extractor import; `importAction` unchanged.
- `apps/web/src/app/admin/community-import/import-client.tsx` — replaced the
  paste→Parse step with a file upload + "paste JSON directly" disclosure;
  imports `ListingDraft`/`parseDraftsJson` from the new module.
- `apps/web/src/app/admin/community-import/page.tsx` — copy now points at the
  `facebook-events-import` skill.
- `apps/web/package.json` — removed `@anthropic-ai/sdk`; `pnpm install` dropped
  2 packages from the lockfile.
- `.env.example` — removed the now-dead `ANTHROPIC_API_KEY` block.
- `.claude/skills/facebook-events-import/SKILL.md` — new skill: URL+paste →
  `ListingDraft[]` JSON file, with the field contract and self-check.

## Patterns observed

- **The cleanest "move AI out of the app" refactors are the ones where the
  persistence boundary already takes the post-AI shape.** `importAction` taking
  `ListingDraft[]` meant the whole change was "swap the input"; nothing
  downstream of the draft moved. When designing an AI-assisted feature, keep the
  AI step as a thin front-end that produces the same DTO a human path produces —
  it makes the AI replaceable/removable later.
- **A skill's contract and the app's coercion function should be the same
  document.** The SKILL.md field table is `coerceDraft`'s expectations in prose;
  drift between them is the failure mode. Kept the example JSON byte-aligned with
  what `parseDraftsJson` accepts.

## Follow-ups

- **Not run against deployed dev.** The upload path and skill are quad-green
  locally but unexercised end-to-end (no e2e covers `/admin/community-import`;
  the admin e2e only touches moderation). Run a real upload against
  `dev.pickupvb.com` before relying on it.
- **`WebFetch` on Facebook is best-effort.** If auto-fetching public URLs
  proves consistently useless for FB, consider trimming the URL path from the
  skill to set expectations — leave for first real use.
