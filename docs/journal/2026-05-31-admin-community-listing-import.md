# Admin AI paste-to-listing importer (2026-05-31)

## Context

User request (the platform owner) wanted an easier way to seed the
**community listings** directory with volleyball events they personally know
about — events that today live as **Facebook events**. Hand-entering each one
through `/community/new` is slow, and the create handler's
**5-submissions-per-24h rate limit** blocks bulk seeding from a single account
outright.

Facebook can't be auto-crawled: Meta retired the public Events API for
third-party apps in 2018, and scraping the event pages fights a login wall +
ToS. So the realistic lever is **cutting manual transcription effort**, not
crawling FB. After confirming direction with the user (AI paste-to-listing, an
admin web page, built as an ongoing tool), we built an admin-gated importer:
paste the text copied off one or more event pages → Claude extracts structured
drafts → admin reviews/fixes → batch-create through the same pipeline the
manual form uses.

## Decisions

- **Reuse the create pipeline, don't fork it.** The import action geocodes via
  `geocodeAddress`, resolves the timezone via `timeZoneForCoords`, validates
  with `CreateCommunityListingSchema`, and runs `CreateCommunityListingCommand`
  — identical to [community/new/actions.ts](../../apps/web/src/app/community/new/actions.ts).
  Imported rows are therefore indistinguishable from hand-entered ones (slug +
  short-code from the same DB triggers).
- **Rate-limit bypass via the existing `isPlatformAdmin` dependency, not a new
  flag.** `CreateCommunityListingHandler` now takes `isPlatformAdmin` (like its
  sibling Update/Delete/Hide handlers) and skips the 5/24h spam guard for
  admins. Chose this over a `bypassRateLimit` flag on the command because the
  limit is a spam guard, not a security boundary, and gating it on admin status
  matches the existing handler-wiring shape. The normal user path is unchanged.
- **The model parses; the server geocodes.** Claude emits a _naive wall-clock_
  `startsAtLocal` and free-text address parts — it never geocodes and never
  emits a timezone. The admin eyeballs the datetime in a `datetime-local` input
  (whose value format is exactly `YYYY-MM-DDTHH:mm`), and the server resolves
  the timezone from the geocoded coords at import — same as the manual flow.
  Kept instant-construction out of the AI's hands entirely.
- **Sonnet, forced single-tool structured output.** `claude-sonnet-4-6` (cheap,
  accurate enough for occasional admin use) with one `emit_listings` tool and
  `tool_choice: { type: 'tool' }`. Static system prompt carries
  `cache_control: { type: 'ephemeral' }`; today's date + the pasted text live
  in the user turn so the cached prefix stays byte-stable.
- **Authorization re-checked in both actions, not just the page.** `parseAction`
  and `importAction` each re-run `requireRealUser` + `isPlatformAdmin`; the page
  guard (`notFound()` for non-admins) is defense-in-depth, not the boundary.
- **Per-row failures don't abort the batch.** `importAction` collects
  `{ ok, slug | error }` per draft and continues, so one bad address doesn't
  sink the rest. Typed failures (`ValidationError`, `ZodError`, geocode `Error`)
  are flattened to a readable per-row message.

## Changes

- [packages/application/src/commands/community-listing.handler.ts](../../packages/application/src/commands/community-listing.handler.ts)
  — `CreateCommunityListingHandler` takes `isPlatformAdmin`; skips the rate
  limit for admins.
- [apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts) — pass
  `isPlatformAdmin` into the create handler.
- [apps/web/src/lib/listing-extract.ts](../../apps/web/src/lib/listing-extract.ts)
  — **new.** `extractListingDrafts(rawText)` via the Anthropic SDK; the first
  use of `@anthropic-ai/sdk` in the repo (`ANTHROPIC_API_KEY` env var). Throws
  `InvariantViolation` on missing key / API error / non-tool response.
- [apps/web/src/app/admin/community-import/](../../apps/web/src/app/admin/community-import/)
  — **new** route: `page.tsx` (admin guard), `import-client.tsx` (paste →
  review → import, 3 steps), `actions.ts` (`parseAction`, `importAction`).
- [apps/web/src/app/community/page.tsx](../../apps/web/src/app/community/page.tsx)
  — admin-only "Import listings (admin)" link near the submit CTA.
- Tests: `community-listing.handler.test.ts` (admin bypass / non-admin still
  limited) and `listing-extract.test.ts` (`vi.mock('@anthropic-ai/sdk')` —
  draft mapping, enum coercion to null, `InvariantViolation` on bad responses).

## Patterns observed

- **`as never` is lint-banned** (`no-restricted-syntax`) even in test fakes.
  The fix: don't `implements Pick<Repo, …>` on a partial fake; drop the
  `implements`, return plain shapes, and cast once at the construction site
  (`repo as unknown as CommunityListingRepository`).
- **Type-only import across the server-only boundary.** The client component
  needs the `ListingDraft` shape but `listing-extract.ts` starts with
  `import 'server-only'`; `import type { ListingDraft }` is erased at build so it
  doesn't drag the server module into the client bundle.
- **Anthropic SDK is now a repo dependency.** First LLM call in the tree;
  follows the existing plain-`fetch` integration style only loosely (it's the
  official SDK). The `claude-api` skill is the reference for extending it.

## Follow-ups

- **Screenshot/vision paste** — FB events are often shared as images; a v2 could
  accept an image and extract via Claude vision. Deferred: v1 covers the common
  copy-paste case.
- **Server-side FB-URL OpenGraph prefill** — deferred; unreliable behind FB's
  login wall, and paste-text is the primary path.
- **No e2e yet** — the importer wasn't exercised against dev. Manual smoke test
  recommended before relying on it: grant self admin, paste a real event, parse
  → review → import, confirm the row at `/community`. Tracked here, not in an
  audit file.
