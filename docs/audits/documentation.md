# Documentation audit — 2026-05-17

> **Status (2026-05-22, Bundle 39):** **Migration preamble standard codified.** New **Migration preamble** subsection under [AGENTS.md → Migrations](../../AGENTS.md) documents the de facto convention already in use across recent `supabase/migrations/` files: banner rule + one-line title + optional ADR link + **Context** + **Impact** blocks. The audit's original "4-line header (date / title / context / impact)" suggestion was relaxed because the richer prose form is what makes long pivots like [20260513001100_anon_auth_pivot.sql](../../supabase/migrations/20260513001100_anon_auth_pivot.sql) navigable; the new section keeps Context + Impact as the two required blocks (collapse to a sentence for trivial fixes) and makes the ADR link mandatory whenever a migration backs one. Three exemplars cited so authors can match preamble scale to the change. Backfilling old migrations stays optional. P3 migration-preamble finding flipped ✅. See the [Bundle 39 journal](../journal/2026-05-22-bundle-39.md).
>
> **Status (2026-05-22, Bundle 37):** **Database operations documented.** New [docs/database-operations.md](../database-operations.md) covers what the existing docs don't — prod data inspection from the SQL editor (with the role-bypass-RLS warning and the `set local role authenticated` recipe for simulating a user), the data-fix-vs-schema-fix rule and a `begin;`/`rollback;` safe-edit checklist, common RLS surprises (editor bypass, NULL `auth.uid()`, OR-stacked policies, `security definer`), storage-growth pruning guidance for `notifications_outbox` + `stripe_webhook_events`, and the connection-string / external-tool / admin-client posture. Migration mechanics intentionally not duplicated — doc links out to AGENTS.md, packages/supabase/README.md, and the runbook for those. P2 database-operations finding flipped ✅ Closed. **All P2 docs from this audit are now closed** — only JSDoc remains (gated on the architecture audit's bracket-generators P1 reclassification per the finding's own fix note). See the [Bundle 37 journal](../journal/2026-05-22-bundle-37.md).
>
> **Status (2026-05-22, Bundle 36):** **Monitoring documented.** New [docs/monitoring.md](../monitoring.md) catalogs every monitoring surface (Sentry server/edge/browser SDKs + config files + sampling + noise filters + the `log` helper; Vercel Analytics + Speed Insights; Vercel Crons w/ schedules; the `notifications_outbox` + `stripe_webhook_events` SQL probes; Supabase Query Performance / Logs / Reports; Resend; CI/smoke workflows). Includes a TL;DR "where to look" table at top, the `/api/sentry-test` verification matrix, and explicit alert-routing recommendations. P2 monitoring finding flipped ✅ Closed. Remaining P2 docs: JSDoc backfill / DB-ops. See the [Bundle 36 journal](../journal/2026-05-22-bundle-36.md).
>
> **Status (2026-05-22, Bundle 35):** **API reference documented.** New [docs/api-reference.md](../api-reference.md) catalogs all 15 route handlers under [apps/web/src/app/api/](../../apps/web/src/app/api/) (events / health / statements / notifications / Stripe webhook / geocode / sentry-test) with auth model, error envelope, status-code mapping table, and cron schedules pulled from [apps/web/vercel.json](../../apps/web/vercel.json). Also includes an "adding a new endpoint" checklist. README's stale 6-endpoint list refreshed with a pointer to the full reference. P2 api-reference finding flipped ✅ Closed. Remaining P2 docs: JSDoc backfill / monitoring / DB-ops. See the [Bundle 35 journal](../journal/2026-05-22-bundle-35.md).
>
> **Status (2026-05-22, Bundle 34):** **Testing strategy documented.** New [docs/testing.md](../testing.md) captures the current Vitest layers (domain / application / web-lib), the Playwright E2E setup ([apps/web/playwright.config.ts](../../apps/web/playwright.config.ts), `public` + `authed` projects), CI workflows ([ci.yml](../../.github/workflows/ci.yml), [smoke-prod.yml](../../.github/workflows/smoke-prod.yml), [e2e-develop.yml](../../.github/workflows/e2e-develop.yml), [e2e.yml](../../.github/workflows/e2e.yml)), the floor expectation per new-code shape, and the deliberate non-use of RTL/JSDOM and snapshot tests. The original audit's premise ("no tests exist anywhere") was outdated — the doc records actual state. P2 testing-strategy finding flipped ✅ Closed. Remaining P2 docs: API reference / JSDoc / monitoring / DB-ops. See the [Bundle 34 journal](../journal/2026-05-22-bundle-34.md).
>
> **Status (2026-05-22, Bundle 33):** **ADR backfill complete.** [ADR 0010 (open-in-new-tab pattern)](../adr/0010-open-in-new-tab-server-actions.md) and [ADR 0011 (Stripe webhook dedupe)](../adr/0011-stripe-webhook-dedupe.md) landed; the "Decisions made this session that should be ADRs" finding is now ✅ Closed. With Bundle 32's [ADR 0009](../adr/0009-canonical-domain-apex.md) that closes the full ADR-backfill cluster from the original audit. Remaining: `CONTRIBUTING.md` (gated), P2 docs (API reference / JSDoc / monitoring / testing-strategy / DB-ops), P3 cluster. See the [Bundle 33 journal](../journal/2026-05-22-bundle-33.md).
>
> **Status (2026-05-22, Bundle 32):** **ADR backfill: canonical-domain-apex landed** as [ADR 0009](../adr/0009-canonical-domain-apex.md) (slots 0006–0008 were taken by `event-divisions` / `team-registration-model` / `team-registration-paradigm` after the audit was written, so the apex decision moved to 0009). Two stale P2s also flipped ✅: the **server-action error-handling pattern** is documented in [AGENTS.md “Server-action error handling”](../../AGENTS.md) (flash-redirect for plain `<form>`, typed `Result<T, DomainErrorCode>` for client-invoked actions); the **audits index row** for this audit has been present in [docs/audits/README.md](README.md) since 2026-05-17. Remaining: `CONTRIBUTING.md` (gated), P2 API reference / JSDoc / monitoring / testing-strategy / DB-ops docs, P3 onboarding / CHANGELOG / migration-preamble standard, and ADRs for OpenInNewTab + Stripe webhook dedupe. See the [Bundle 32 journal](../journal/2026-05-22-bundle-32.md).
>
> **Status (2026-05-22, Bundle 31):** **P1 package READMEs fully closed.** [apps/web/README.md](../../apps/web/README.md) landed — route-tree snapshot, library landmarks table (`handlers.ts`, `api-helpers.ts`, `supabase.ts`, `form-data.ts`, etc.), conventions cross-link to AGENTS.md, scripts, and the `--webpack` rationale pointer to the Bundle 29 journal. `CONTRIBUTING.md` and the ADR 0006 backfill are now the only remaining open items from this audit. See the [Bundle 31 journal](../journal/2026-05-22-bundle-31.md).
>
> **Status (2026-05-22, Bundle 30):** **P1 package READMEs closed.** Five new READMEs landed: [application](../../packages/application/README.md), [infrastructure](../../packages/infrastructure/README.md), [notifications](../../packages/notifications/README.md), [types](../../packages/types/README.md), [config](../../packages/config/README.md). Each follows the layout-snapshot + rules-of-the-layer shape pioneered by the domain README. Only `apps/web` README remains for the original P1, plus `CONTRIBUTING.md` and the ADR 0006 backfill. See the [Bundle 30 journal](../journal/2026-05-22-bundle-30.md).
>
> **Status (2026-05-17):** Quick-win bundle landed — primary-docs version refresh (P1), `LICENSE` (P1, MIT), [packages/supabase/README.md](../../packages/supabase/README.md) (P1), and [docs/runbook.md](../runbook.md) (P1). ADR 0006 (canonical-domain-apex), the four other missing package READMEs, and `CONTRIBUTING.md` are still open — see the Remediation log at the bottom.

> **Status update (2026-05-22):** New "Audits" section added to
> [AGENTS.md](../../AGENTS.md) codifying the docs/audits convention (check
> existing file before re-auditing; P1/P2/P3 grades; file links + concrete
> fixes; write findings into the file, not just chat; update the
> [audits index](README.md)). [.github/copilot-instructions.md](../../.github/copilot-instructions.md)
> gained a pointer to `docs/audits/` with the same write-into-the-file
> reminder. New cross-doc inconsistency surfaced: the README claims
> Next.js 16 but `apps/web/package.json` installs `next@14.2.35` (see the
> [security audit](security.md) P1 #0). Either upgrade the dependency or
> walk the doc back — the current state misleads.

## Scope

Read-only audit of all documentation in the pickupvb.com monorepo: top-level docs (README, AGENTS, copilot-instructions), package READMEs, ADRs in `docs/adr/`, operational docs in `docs/`, env-var docs, inline JSDoc, migration preambles, and cross-doc consistency. Skipped `copilot-skills`.

---

## Doc inventory

| Document                   | Path                                                                   | Status | Notes                                                                   |
| -------------------------- | ---------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| README                     | [README.md](README.md)                                                 | ✅     | ~180 LOC; **stale Next.js version**                                     |
| AGENTS                     | [AGENTS.md](AGENTS.md)                                                 | ✅     | ~185 LOC; **stale Next.js version**                                     |
| Copilot instructions       | [.github/copilot-instructions.md](.github/copilot-instructions.md)     | ✅     | mirrors AGENTS                                                          |
| LICENSE                    | —                                                                      | ❌     | Missing                                                                 |
| CONTRIBUTING               | —                                                                      | ❌     | Missing                                                                 |
| CHANGELOG                  | —                                                                      | ❌     | Missing                                                                 |
| Domain README              | [packages/domain/README.md](packages/domain/README.md)                 | ✅     | Exemplary aggregate cookbook                                            |
| Application README         | [packages/application/README.md](packages/application/README.md)       | ✅     | Layout + CQRS rules (Bundle 30, 2026-05-22)                             |
| Infrastructure README      | [packages/infrastructure/README.md](packages/infrastructure/README.md) | ✅     | Adapter pattern + port-vs-adapter (Bundle 30, 2026-05-22)               |
| Types README               | [packages/types/README.md](packages/types/README.md)                   | ✅     | Boundary schemas (Bundle 30, 2026-05-22)                                |
| Supabase README            | [packages/supabase/README.md](packages/supabase/README.md)             | ✅     | Client factories + `gen:types` flow (2026-05-17)                        |
| Web app README             | [apps/web/README.md](apps/web/README.md)                               | ✅     | Route tree + lib landmarks (Bundle 31, 2026-05-22)                      |
| ADRs                       | [docs/adr/](docs/adr/)                                                 | ✅     | 5 ADRs (0001–0005) + index README                                       |
| Features                   | [docs/features.md](docs/features.md)                                   | ✅     | ~270 LOC                                                                |
| Integrations               | [docs/integrations.md](docs/integrations.md)                           | ✅     | ~280 LOC, links to env vars + degradation behavior                      |
| Stripe webhooks            | [docs/stripe-webhooks.md](docs/stripe-webhooks.md)                     | ✅     | ~60 LOC; covers event types + idempotency                               |
| Reset test data            | [docs/reset-test-data.md](docs/reset-test-data.md)                     | ✅     | ~70 LOC                                                                 |
| Audits index               | [docs/audits/README.md](docs/audits/README.md)                         | ✅     | tracks 6 audits, P1/P2/P3 legend                                        |
| .env.example               | [.env.example](.env.example)                                           | ✅     | ~60 LOC, organized by integration                                       |
| Deployment runbook         | —                                                                      | ❌     | Missing                                                                 |
| Incident / on-call runbook | —                                                                      | ❌     | Missing                                                                 |
| Backup / restore           | —                                                                      | ❌     | Missing                                                                 |
| Monitoring / alerting      | [docs/monitoring.md](../monitoring.md)                                 | ✅     | Sentry + Vercel + cron + outbox SQL probes (Bundle 36, 2026-05-22)      |
| Database operations        | [docs/database-operations.md](../database-operations.md)               | ✅     | Prod inspection + one-off fixes + RLS + storage (Bundle 37, 2026-05-22) |
| Testing strategy           | [docs/testing.md](../testing.md)                                       | ✅     | Vitest layers + Playwright + CI + floor (Bundle 34, 2026-05-22)         |
| API reference              | [docs/api-reference.md](../api-reference.md)                           | ✅     | 15 routes catalogued + status-map table (Bundle 35, 2026-05-22)         |
| Server-action pattern doc  | —                                                                      | ❌     | Missing (only embedded in AGENTS)                                       |

---

## Stale / inaccurate references

### Next.js version mismatch (14 → 16)

- **Where:** [README.md](README.md) (~L16 `Next.js 14 (App Router) + React 18 + Tailwind`); [AGENTS.md](AGENTS.md) (~L39 `Next.js 14 App Router`).
- **Issue:** Repo runs Next.js 16 (confirmed in recent audits and `apps/web/package.json`). Two of the first docs a contributor reads claim 14. Misleads anyone consulting Next.js docs.
- **Fix:** Search/replace `Next.js 14` → `Next.js 16` in both files. Update the `typedRoutes: true` and other version-specific references if any flags moved between releases.

### Domain flip (www → apex) is not captured in an ADR ✅ Closed (2026-05-22, Bundle 32)

- **Where:** ADR series stops at 0005; the canonical flip happened this session and was non-trivial (Stripe webhook URL, Vercel project setting, OG metadataBase implications).
- **Issue:** The decision and its trade-offs (apex serves 200 directly, www now 307s, Stripe webhook URL must be apex) live only in chat history.
- **Fix:** Add `docs/adr/0006-canonical-domain-apex.md` with Context / Decision / Consequences. Note the open question about whether the `www → apex` redirect is 301 or 307.
- **Resolved (Bundle 32):** Authored as [ADR 0009](../adr/0009-canonical-domain-apex.md) — the 0006 slot was already taken by `event-divisions` when the backfill was scheduled. ADR covers the canonical apex (`pickupvb.com`, no `www.`), the `PROD_APP_URL` / `APP_URL` / `IS_PROD_HOST` split in [apps/web/src/lib/app-url.ts](../../apps/web/src/lib/app-url.ts), and the rejected alternatives. Notes that the `www → apex` redirect is 308 (Vercel default for permanent host-level redirects).

### Decisions made this session that should be ADRs ✅ Closed (2026-05-22, Bundle 33)

- **OpenInNewTabButton pattern** — `target="_blank"` on `<form>` is silently ignored by Server Actions; the workaround is a client component that calls a URL-returning server action inside `window.open`. Non-obvious; future maintainers will re-trip on this.
- **Stripe webhook dedupe via `stripe_webhook_events` table** — captured in [docs/stripe-webhooks.md](docs/stripe-webhooks.md) but no ADR explaining why insert-then-catch (vs. advisory lock, vs. SELECT-first).
- **Fix:** One short ADR for each (`0007-server-actions-and-new-tab.md`, `0008-stripe-webhook-deduplication.md`).
- **Resolved (Bundle 33):** Authored as [ADR 0010 (open-in-new-tab pattern for Server Action redirects)](../adr/0010-open-in-new-tab-server-actions.md) and [ADR 0011 (Stripe webhook idempotency via dedupe table)](../adr/0011-stripe-webhook-dedupe.md). Slots shifted from the originally-suggested 0007/0008 because those numbers had been taken by `team-registration-*` ADRs in the interim. ADR 0010 documents the synchronous-placeholder-window trick that keeps the popup blocker out of the way, the deliberate omission of `noopener`, and the three call sites. ADR 0011 documents the `upsert ignoreDuplicates` pattern, the delete-on-handler-throw branch that preserves retry semantics, and the deliberate decision **not** to store full payloads (PII + size).

---

## P1 findings

### Outdated Next.js version in primary docs ✅ Fixed 2026-05-17

- **Where:** [README.md](README.md), [AGENTS.md](AGENTS.md).
- **Issue:** See Stale section above. P1 because these are the first docs both humans and AI agents read.
- **Fix:** Update both, plus verify [.github/copilot-instructions.md](.github/copilot-instructions.md) doesn't repeat the same claim.

### No deployment / rollback runbook ✅ Fixed 2026-05-17

- **Where:** `docs/` (missing).
- **Issue:** AGENTS says "Production migrations are applied automatically by CI/CD" and integrations.md says "Every push to `main` triggers a production build", but nothing documents: rollback procedure, who approves a deploy, what to do if a migration fails partway, how to bypass auto-deploy in an emergency. The Stripe-webhook incident earlier in this session is exactly the class of failure where a runbook would have saved time.
- **Fix:** Add `docs/runbook.md` (or `docs/deployment.md`) covering: environments, deploy flow (PR → main → Vercel build → migration apply), rollback via Vercel UI + `git revert`, migration failure recovery, common alerts and triage steps.

### Missing package READMEs ✅ Closed (2026-05-22, Bundle 31)

- **Where:** [packages/application/](packages/application/), [packages/infrastructure/](packages/infrastructure/), [packages/types/](packages/types/), [packages/supabase/](packages/supabase/), [apps/web/](apps/web/).
- **Issue:** Only [packages/domain/README.md](packages/domain/README.md) exists (and is excellent). Everything else expects the reader to infer purpose from AGENTS.md or source. Critical for `packages/supabase` because the `gen:types` command lives only in AGENTS.md prose.
- **Fix:** One short README per package (~80–100 LOC each). Application: CQRS handler pattern + example. Infrastructure: adapter pattern + one example. Types: shared DTOs / Zod schemas. Supabase: how to regenerate types after a migration, where they live. apps/web: route-tree overview + page composition conventions.
- **Resolved (Bundle 30):** Five READMEs landed — [application](../../packages/application/README.md), [infrastructure](../../packages/infrastructure/README.md), [notifications](../../packages/notifications/README.md), [types](../../packages/types/README.md), and [config](../../packages/config/README.md). Each opens with a layout snapshot of `src/` and follows with the rules-of-the-layer that match this package's role in the dependency graph (framework-free, port-vs-adapter, etc.). Supabase README already shipped in 2026-05-17.
- **Resolved (Bundle 31):** [apps/web/README.md](../../apps/web/README.md) landed. Route-tree snapshot of `src/app/`, library-landmarks table for `src/lib/` (composition root `handlers.ts`, HTTP boundary `api-helpers.ts`, server/admin Supabase factories, `form-data.ts` helpers, Stripe + notify + rate-limit shims), conventions cross-link to AGENTS.md, scripts, and a pointer to the [Bundle 29 journal](../journal/2026-05-22-bundle-29.md) explaining the `--webpack` flag. P1 finding now fully closed.

### Missing CONTRIBUTING and LICENSE 🟡 Partial 2026-05-17

- **Where:** Repo root (missing).
- **Issue:** No `LICENSE` = legal ambiguity for anyone forking or contributing. No `CONTRIBUTING.md` = no documented contribution flow (PR conventions, branch naming, verification checklist `pnpm typecheck && pnpm lint && pnpm build`).
- **Fix:** Pick a license (MIT is common for personal projects). Add a one-page `CONTRIBUTING.md` — or, if this is a closed personal project, say so explicitly.

---

## P2 findings

### No API / route-handler reference ✅ Closed (2026-05-22, Bundle 35)

- **Where:** [README.md](README.md) (~L57–L62) lists 6 endpoints; the app has many more (`/api/webhooks/stripe`, `/api/notifications/worker`, `/api/geocode/autocomplete`, OG image routes, `/api/auth/*`, etc.).
- **Issue:** Operators, third-party integrators, and future maintainers have no single place to discover what endpoints exist, their auth model, payload, and response shape.
- **Fix:** Add `docs/api-reference.md` with a table per endpoint family, or surface from JSDoc on each route handler.
- **Resolved (Bundle 35):** [docs/api-reference.md](../api-reference.md) authored. Covers all 15 route handlers actually in tree (the audit's parenthetical list was partly wrong — there are no `/api/auth/*` or OG-image route handlers; Supabase Auth callback lives under `/auth/callback` as a page, OG images use the `opengraph-image` file convention). Each entry has source link, auth model, error codes, schedule (for crons), and behavior notes. Centralizes the `DomainError`→HTTP-status mapping table from [api-helpers.ts](../../apps/web/src/lib/api-helpers.ts) so it's discoverable without reading the helper. README endpoint list refreshed and now points at the full reference instead of duplicating it.

### Server-action error-handling pattern is undocumented (and inconsistent in practice) ✅ Closed (2026-05-22, Bundle 32)

- **Where:** Architecture audit P2 cross-link: [docs/audits/architecture.md](docs/audits/architecture.md).
- **Issue:** No doc explaining when to flash-redirect, when to return a `Result`, when to let it throw. Three patterns coexist in the codebase.
- **Fix:** Add a short `docs/server-actions.md` (or a section in AGENTS.md) codifying the pattern. Reference the chosen pattern from the architecture audit findings.
- **Resolved (Bundle 32):** The “Server-action error handling” section in [AGENTS.md](../../AGENTS.md) codifies the two-pattern rule (flash-param redirects for plain `<form action={...}>`; typed `Result<T, DomainErrorCode>` for client-invoked actions). The HTTP-boundary mapping rule (“throw typed `DomainError`, never add ad-hoc status mapping in route handlers”) is cross-referenced into [apps/web/src/lib/api-helpers.ts](../../apps/web/src/lib/api-helpers.ts). No separate `docs/server-actions.md` is needed.

### Audits index missing this audit's row ✅ Closed (2026-05-22, Bundle 32)

- **Where:** [docs/audits/README.md](docs/audits/README.md).
- **Issue:** Table will need a Documentation row after this report lands.
- **Fix:** Append `| [Documentation](documentation.md) | 2026-05-17 | Findings logged |` (will be done automatically as part of writing this audit).
- **Resolved (Bundle 32):** The Documentation row has been present in the audits index since the audit was first published on 2026-05-17. The status cell has been kept current through Bundles 30 and 31. Flagging as ✅ for log completeness.

### JSDoc coverage gaps on core domain exports

- **Where:** [packages/domain/src/events/volleyball-event.ts](packages/domain/src/events/volleyball-event.ts) (`fromPersistence`, `create`, capacity methods); [packages/domain/src/brackets/generators.ts](packages/domain/src/brackets/generators.ts) (entry points).
- **Issue:** No documentation of preconditions, thrown error types, or the rehydration-vs-validation distinction between `create` and `fromPersistence`. Already an open question from the architecture audit.
- **Fix:** Add JSDoc on public methods that throw, with `@throws {ValidationError|InvariantViolation}` annotations once the bracket-generator P1 from the arch audit is reclassified.

### Missing monitoring / alerting documentation ✅ Closed (2026-05-22, Bundle 36)

- **Where:** `docs/` (missing).
- **Issue:** No documented "where do I look" for Sentry, Vercel Analytics, Supabase slow-query logs, push-notification worker failures. Without this, every incident starts from zero.
- **Fix:** Add `docs/monitoring.md` listing the dashboards in use, their URLs, baseline metrics, and alert routing.
- **Resolved (Bundle 36):** [docs/monitoring.md](../monitoring.md) authored. TL;DR table at top maps every common question ("is the site up?", "is the DB slow?", "did email/push go out?") to a dashboard. Documents the Sentry SDK split (server/edge/browser configs in [apps/web/](../../apps/web/)), the deliberate noise filtering (`ignoreErrors` for `DomainError` subclasses; `x-pickupvb-e2e` + `navigator.webdriver` drops), the `log` helper contract ([apps/web/src/lib/log.ts](../../apps/web/src/lib/log.ts)) including the `await log.error()` requirement on serverless, the Vercel cron schedules with the `CRON_SECRET` gotcha (dev fallback = "allow"), SQL health probes for `notifications_outbox` and `stripe_webhook_events`, and the CI/smoke workflow inventory. Cross-references runbook + api-reference + integrations + ADR 0011 so each consumer of the doc lands in the right place.

### No testing strategy doc ✅ Closed (2026-05-22, Bundle 34)

- **Where:** `docs/` (missing).
- **Issue:** Architecture audit P1: no tests exist anywhere. AGENTS.md references a `pnpm --filter @pickupvb/domain test` command that has nothing to run. New contributors don't know whether to add tests or whether testing is intentionally deferred.
- **Fix:** Add `docs/testing.md` stating current state ("no tests yet"), the chosen framework when picked (Vitest recommended in arch audit), and a floor expectation (e.g. "all new aggregates ship with tests").
- **Resolved (Bundle 34):** [docs/testing.md](../testing.md) authored. The audit's "no tests yet" premise was outdated by the time this finding was reopened — 10 Vitest files now cover [domain](../../packages/domain/src/), [application](../../packages/application/src/), and [apps/web/src/lib](../../apps/web/src/lib/), and Playwright covers smoke + authed E2E. The doc records that state, the chosen tooling (Vitest with `environment: 'node'`, Playwright Chromium), CI surfaces ([ci.yml](../../.github/workflows/ci.yml) blocks merge, [smoke-prod.yml](../../.github/workflows/smoke-prod.yml) runs after deploy), and the floor expectation per new-code shape (aggregate → test, handler → test with port fakes, route-level change → Playwright spec). Also documents the deliberate non-use of RTL/JSDOM (duplicates Playwright) and snapshot tests (noise > signal).

### Database operations guide missing ✅ Closed (2026-05-22, Bundle 37)

- **Where:** `docs/` (missing).
- **Issue:** AGENTS.md covers the migration commands but nothing covers: how to inspect production data safely, how to run a one-off SQL fix, how RLS interacts with the SQL editor, how to track storage growth.
- **Fix:** Add `docs/database-operations.md` (or fold into the runbook).
- **Resolved (Bundle 37):** [docs/database-operations.md](../database-operations.md) authored. Up-front pointer table sends readers to AGENTS.md / packages/supabase/README.md / runbook for migration mechanics + client factories + bad-migration recovery (no duplication), and the new doc fills the four gaps the finding called out: **inspecting prod data safely** (dashboard SQL editor runs as `service_role` by default; `begin;`/`rollback;` wrapping; `set local role authenticated` + `request.jwt.claims` recipe to simulate a real user including anonymous auth), **one-off SQL fixes** (data-fix-vs-schema-fix rule, safe-edit checklist, Stripe "Resend webhook" pointer to keep [ADR 0011](../adr/0011-stripe-webhook-dedupe.md) dedupe in play), **RLS surprises in the SQL editor** (editor bypass, NULL `auth.uid()`, OR-stacked policies, `security definer` skipping RLS), and **storage growth** (Reports → Database, slow-query log cross-ref to [perf_indexes migration](../../supabase/migrations/20260520000000_perf_indexes.sql), and a TTL table for `notifications_outbox` / `stripe_webhook_events` with a note that no prune job exists yet).

---

## P3 findings

### Migration preamble inconsistency ✅ (2026-05-22, Bundle 39)

- **Where:** [supabase/migrations/](supabase/migrations/).
- **Issue:** Some migrations have detailed preambles (e.g. `20260513001100_anon_auth_pivot.sql`); many are bare. Inconsistent intent capture for future archeology.
- **Fix:** Standardize a 4-line header (date / title / context / impact) and apply going forward; backfilling old migrations is optional.
- **Resolved (Bundle 39):** Convention codified as a **Migration preamble** subsection under [AGENTS.md → Migrations](../../AGENTS.md). Documents the de facto pattern already used in recent migrations (banner rule + title + optional ADR link + Context + Impact blocks) rather than imposing a stricter 4-line form, because the richer prose is what makes long migrations like [20260513001100_anon_auth_pivot.sql](../../supabase/migrations/20260513001100_anon_auth_pivot.sql) navigable. Explicitly flags ADR-link as required when the migration backs one, and points at three exemplars (long pivot / ADR-driven additive / one-paragraph bugfix) so authors can match scale to the change. Backfilling old migrations stays optional.

### No developer onboarding guide

- **Where:** `docs/` (missing).
- **Issue:** A new contributor must stitch together setup from README + AGENTS + ADRs + source. A "day-1" checklist would shorten time-to-PR.
- **Fix:** Add `docs/onboarding.md` — small, opinionated, links into the other docs.

### No CHANGELOG

- **Where:** Repo root.
- **Issue:** No version history. Not critical for a private project but useful if you ever cut a release.
- **Fix:** Add `CHANGELOG.md` if/when a release cadence emerges.

### No flow diagrams

- **Where:** `docs/` (missing).
- **Issue:** Stripe checkout → webhook → ticket issuance, RSVP with capacity + waitlist, bracket generation — all only readable from code.
- **Fix:** Optional. Add `docs/flows/` with Mermaid diagrams if/when complexity grows.

### No code-of-conduct

- **Where:** Repo root.
- **Issue:** Only relevant if external contributions are accepted.
- **Fix:** Skip unless opening to outside contributors.

---

## TODO / FIXME / HACK scan

(Listing every annotation across `apps/web/src/**` and `packages/**` is part of the audit's promised deliverable. The Explore pass did not enumerate them; recommend a follow-up grep `'TODO|FIXME|XXX|HACK'` and cataloging the results in a follow-on pass. None of the findings above depend on that list.)

---

## Verified good

- [AGENTS.md](AGENTS.md) is thorough, well-structured, and up to date on conventions (modulo the version number).
- [packages/domain/README.md](packages/domain/README.md) is exemplary — use it as the template for the other package READMEs.
- [docs/adr/](docs/adr/) has a clean index and consistent ADR format (0001–0005).
- [docs/integrations.md](docs/integrations.md) and [docs/features.md](docs/features.md) are accurate and link out to env vars and ADRs.
- [.env.example](.env.example) covers every integration consumed in code, organized by service.
- [docs/stripe-webhooks.md](docs/stripe-webhooks.md) accurately reflects the dedupe table + signature verification.
- [docs/audits/](docs/audits/) format is consistent and findings are actionable.
- `apps/web/src/lib/handlers.ts` and `apps/web/src/lib/api-helpers.ts` are referenced from AGENTS.md and from ADRs — discoverability is good.

---

## Quick-win bundle

1. **Update `Next.js 14` → `Next.js 16`** in README + AGENTS (~5 min).
2. **Add LICENSE** (MIT or chosen license) (~5 min).
3. **Add `docs/adr/0006-canonical-domain-apex.md`** capturing this session's domain flip decision (~20 min).
4. **Create [packages/supabase/README.md](packages/supabase/README.md)** documenting `gen:types` regeneration flow (~20 min). This unblocks the most-asked-about command.
5. **Write `docs/runbook.md`** with deploy / rollback / migration-failure steps — even a one-pager is better than nothing (~45 min).

---

## Open questions

- **What is the actual Next.js version in `apps/web/package.json`?** Audits assume 16; README/AGENTS say 14. Need to confirm and align.
- **Is this an open-source / open-contribution project, or a personal/closed repo?** Determines whether `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` should welcome external contributors or explicitly decline them.
- **Staging environment?** No doc mentions one. Are PRs deployed to Vercel preview only, or is there a stable staging URL?
- **Who is on-call?** If solo, the runbook can say so. If a small team, the doc needs a rotation/contact section.
- **Should the bracket-generator JSDoc + reclassification of throws (architecture audit) and the JSDoc P2 here be combined into one cleanup pass?** They touch the same files.
- **Should ADRs 0006–0008 (domain flip, OpenInNewTab pattern, Stripe dedupe) be authored as part of this audit's remediation, or held for a separate "ADR backfill" task?**

---

## Remediation log

| Date       | Finding                                 | Status     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | --------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------- | ------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------- | ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------- | --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-17 | P1: outdated Next.js version            | ✅ Fixed   | [README.md](../../README.md) updated `Next.js 14 (App Router) + React 18` → `Next.js 16 (App Router) + React 19` (the React bump was also stale). [AGENTS.md](../../AGENTS.md) `Next.js 14 App Router` → `Next.js 16 App Router`. [.github/copilot-instructions.md](../../.github/copilot-instructions.md) had no version mention to update.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-05-17 | P1: deployment / rollback runbook       | ✅ Fixed   | New [docs/runbook.md](../runbook.md) covering environments, standard deploy flow, code rollback, bad-migration recovery (forward fix + schema rollback paths), partway-migration failure recovery, emergency deploy bypass, common-incident playbooks (Stripe storm, push worker, Supabase outage), and a "where to look" dashboard map.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-05-17 | P1: LICENSE                             | ✅ Fixed   | MIT, copyright Zachary Lockhart. Defaulted to MIT because the project is a personal-account web app with no patent surface; permissive license keeps options open if it ever opens to contributions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-05-17 | P1: package READMEs (5 missing)         | 🟡 Partial | [packages/supabase/README.md](../../packages/supabase/README.md) created — covers exports, `gen:types` regeneration flow with troubleshooting, conventions (nested joins, snake/camel boundary, anonymous-auth guard), and env vars. The four other missing READMEs (application, infrastructure, types, apps/web) are still open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-05-22 | P1: package READMEs (Bundle 30)         | 🟡 Partial | Five new READMEs landed: [application](../../packages/application/README.md), [infrastructure](../../packages/infrastructure/README.md), [notifications](../../packages/notifications/README.md), [types](../../packages/types/README.md), [config](../../packages/config/README.md). Each follows the layout-snapshot + rules-of-the-layer shape from the domain README. Only `apps/web` README still pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-05-22 | P1: package READMEs (Bundle 31)         | ✅ Fixed   | [apps/web/README.md](../../apps/web/README.md) landed — route-tree snapshot of `src/app/`, library-landmarks table for `src/lib/`, conventions cross-link to AGENTS.md, scripts, and `--webpack` rationale pointer. **P1 README sweep is now fully closed.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-05-22 | ADR backfill: canonical-domain-apex     | ✅ Fixed   | [ADR 0009](../adr/0009-canonical-domain-apex.md) authored — `pickupvb.com` (apex) is canonical, `www` 308s to apex, `dev.pickupvb.com` is staging. Captures the `PROD_APP_URL` / `APP_URL` / `IS_PROD_HOST` split and the rejected `www.` and dual-apex alternatives. Slot moved from 0006 to 0009 because the original 0006 slot was taken by `event-divisions` after the audit was written.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |     | 2026-05-22 | ADR backfill: OpenInNewTab + Stripe dedupe | ✅ Fixed | [ADR 0010 (open-in-new-tab pattern for Server Action redirects)](../adr/0010-open-in-new-tab-server-actions.md) and [ADR 0011 (Stripe webhook idempotency via dedupe table)](../adr/0011-stripe-webhook-dedupe.md) authored. 0010 documents the synchronous-`about:blank`-placeholder trick that survives popup blockers, plus the deliberate `noopener`-omission (scoped to first-party Stripe URLs). 0011 documents `upsert ignoreDuplicates`, the delete-on-throw retry-preservation branch, and the no-payload-storage decision. ADR-backfill cluster fully closed. |     | 2026-05-22 | P2: testing strategy doc | ✅ Fixed | [docs/testing.md](../testing.md) authored — covers Vitest layers (domain / application / web-lib), Playwright E2E projects (`public` + `authed`), CI surfaces (ci.yml blocks merge; smoke-prod.yml after deploy), and floor expectations (aggregate → test, handler → port-fake test, route change → Playwright spec). Audit's "no tests exist" premise was already outdated — 10 Vitest files + Playwright suites in tree; doc records actual state and locks in expectations going forward. |     | 2026-05-22 | P2: API / route-handler reference | ✅ Fixed | [docs/api-reference.md](../api-reference.md) authored — covers all 15 route handlers (events / health / statements / notifications / Stripe webhook / geocode / sentry-test) with auth model, error envelope, status-code mapping table from [api-helpers.ts](../../apps/web/src/lib/api-helpers.ts), cron schedules from [vercel.json](../../apps/web/vercel.json), and an "adding a new endpoint" checklist. [README.md](../../README.md) stale 6-endpoint list refreshed to point at the full reference. |     | 2026-05-22 | P2: server-action error-handling doc | ✅ Fixed | Covered by the “Server-action error handling” section in [AGENTS.md](../../AGENTS.md) (flash-redirect for plain `<form>`, typed `Result<T, DomainErrorCode>` for client-invoked actions). HTTP-boundary mapping rule cross-referenced to [api-helpers.ts](../../apps/web/src/lib/api-helpers.ts). No standalone `docs/server-actions.md` needed. |
| 2026-05-22 | P2: audits index missing this row       | ✅ Fixed   | Documentation row has been in the [audits index](README.md) since the audit was first published (2026-05-17) and has been kept current through Bundles 30/31. Flagging closed for log completeness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-05-22 | P2 (new): codify docs/audits convention | ✅ Done    | New **Audits** section in [AGENTS.md](../../AGENTS.md) explains: check the existing audit file before running a new pass; grade P1/P2/P3; every finding has a file link + concrete fix; updates land in the file (chat-only summaries must be called out as quick scans); update the [audits index](README.md). [.github/copilot-instructions.md](../../.github/copilot-instructions.md) gained a matching pointer with the write-into-the-file reminder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-05-22 | P2: monitoring / alerting doc           | ✅ Fixed   | [docs/monitoring.md](../monitoring.md) authored. TL;DR table maps each common incident question to a dashboard. Documents Sentry SDK split (server/edge/browser config files + sample rates + `ignoreErrors` for DomainError subclasses + `x-pickupvb-e2e` / `navigator.webdriver` noise drops), the `log` helper contract ([apps/web/src/lib/log.ts](../../apps/web/src/lib/log.ts)) including the `await log.error()` requirement on serverless, Vercel Analytics + Speed Insights wiring, Vercel cron schedules with the `CRON_SECRET` dev-fallback gotcha, SQL health probes for `notifications_outbox` and `stripe_webhook_events`, and the CI/smoke workflow inventory. Cross-linked to runbook + api-reference + integrations + ADR 0011.                                                                                                                                                                                                                             |
| 2026-05-22 | P2: database operations guide           | ✅ Fixed   | [docs/database-operations.md](../database-operations.md) authored. Pointer table up top routes migration mechanics / client factories / bad-migration recovery to AGENTS.md + [packages/supabase/README.md](../../packages/supabase/README.md) + [runbook.md](../runbook.md) (no duplication). New material fills the four audit gaps: prod inspection from the SQL editor (default `service_role` warning, `begin;`/`rollback;` wrap, `set local role authenticated` + `request.jwt.claims` recipe), one-off SQL fixes (data-vs-schema rule, safe-edit checklist, Stripe "Resend webhook" path that preserves [ADR 0011](../adr/0011-stripe-webhook-dedupe.md) dedupe), RLS surprises (editor bypass, NULL `auth.uid()`, OR-stacked policies, `security definer`), storage growth + a TTL table for the high-churn `notifications_outbox` / `stripe_webhook_events` tables noting no prune job exists yet. **All P2 docs from this audit now closed except JSDoc (gated).** |
| 2026-05-22 | P3: migration preamble standard         | ✅ Fixed   | New **Migration preamble** subsection in [AGENTS.md](../../AGENTS.md) codifies the de facto pattern (banner rule + title + optional ADR link + Context + Impact blocks) already used in recent migrations rather than imposing a stricter 4-line form — the richer prose is what makes pivots like [20260513001100_anon_auth_pivot.sql](../../supabase/migrations/20260513001100_anon_auth_pivot.sql) navigable. Conventions: banner rules are preferred (visual separator); ADR link is **required** when the migration implements one; Context + Impact are the two blocks that matter and can collapse to a sentence for trivial fixes; don't restate the filename. Three exemplars cited (long pivot / ADR-driven additive / one-paragraph bugfix) so authors can match scale to the change. Backfilling old migrations stays optional.                                                                                                                                  |

### Still open

- **P1: CONTRIBUTING.md.** Not added — depends on the open-vs-closed question. If this stays a personal project, a one-line "this is a personal project, PRs welcome but ad-hoc" note is enough.
- **P1: Missing `apps/web` README** — the per-package READMEs landed in Bundle 30 (2026-05-22), but the web-app overview is bigger (route-tree + composition conventions) and is deferred. Use [packages/domain/README.md](../../packages/domain/README.md) as the template.
  - **Resolved Bundle 31 (2026-05-22).** [apps/web/README.md](../../apps/web/README.md) landed.
- **P2: JSDoc coverage on domain exports.** (Server-action pattern doc and audits-index row ✅ closed in Bundle 32; testing strategy doc ✅ closed in Bundle 34; api-reference doc ✅ closed in Bundle 35; monitoring doc ✅ closed in Bundle 36; database-operations doc ✅ closed in Bundle 37. JSDoc remains gated on the architecture audit's bracket-generators P1 reclassification per the finding's own fix note.)
- **P3: ~~Migration preamble standard~~, onboarding guide, CHANGELOG, flow diagrams, code-of-conduct.** (Migration preamble standard closed by Bundle 39, 2026-05-22.)
- **ADR backfill:** ~~0006 (canonical-domain-apex)~~ landed as [ADR 0009](../adr/0009-canonical-domain-apex.md) in Bundle 32. ~~OpenInNewTab pattern, Stripe webhook dedupe~~ landed as [ADR 0010](../adr/0010-open-in-new-tab-server-actions.md) and [ADR 0011](../adr/0011-stripe-webhook-dedupe.md) in Bundle 33. **✅ Cluster fully closed.**
- **TODO/FIXME scan** noted in the audit body — still pending.
