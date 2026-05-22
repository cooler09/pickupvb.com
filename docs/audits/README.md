# Audits

Point-in-time codebase audits. Each file is a snapshot — findings reflect the
state of the repo at the date in the document header. Use them as a backlog
of remediation work, not as a permanent reference. Re-run an audit after you
land its fixes.

For the narrative behind each remediation bundle (decisions, rejected
alternatives, patterns observed), see [docs/journal/](../journal/).

| Audit                                             | Date       | Status                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Security](security.md)                           | 2026-05-22 | Bundle 27 (2026-05-22): P2 #3a — CSP promoted from Report-Only to enforcing `Content-Security-Policy`. P3 #8 audit-log coverage, P3 #11 preemptive upload hardening, and the new P2 #3b nonce-based hardening of `'unsafe-inline'` remain open                                                         |
| [Performance](performance.md)                     | 2026-05-22 | Bundle 26 (2026-05-22): `/events/[id]` viewer-independent side-loads now cached via `unstable_cache` (60 s, tagged `event:{id}`). Anonymous cold hits skip Supabase on warm cache. Full structural ISR refactor of `/events/[id]` + `/events` still deferred; P1 #1 status 3/5 done, 1 partial, 1 open |
| [Architecture (CQRS/DRY/SOLID)](architecture.md)  | 2026-05-22 | Bundle 22 closed P1 test bootstrap; Bundle 23 closed P1 events/[id] page diet via `loadEventDetail` (887 → 566 LOC); Bundle 24 closed P2 JSX componentization (566 → **294 LOC**). No P1s remaining.                                                                                                   |
| [508 / Accessibility](accessibility.md)           | 2026-05-22 | Mobile menu focus trap + shared FieldError landed 2026-05-22 (Bundle 2)                                                                                                                                                                                                                                |
| [SEO](seo.md)                                     | 2026-05-24 | Bundle 18 shipped `BreadcrumbList` JSON-LD; Bundle 20 shipped `SportsTeam` + `SportsOrganization` JSON-LD; Bundle 21 dropped the `/teams/[slug]` login gate so crawlers can reach the structured data; force-dynamic Suspense refactor (P2) still deferred                                             |
| [Documentation](documentation.md)                 | 2026-05-22 | AGENTS Audits section landed 2026-05-22; ADR backfill + READMEs still open                                                                                                                                                                                                                             |
| [Developer project organization](organization.md) | 2026-05-22 | Bundle 28 (2026-05-22): P1 #2 closed — 5 placeholder `test` scripts now run `vitest run --passWithNoTests`; CI no longer green-by-accident. Lint coverage P1 already closed (Bundle 8). P2s remain                                                                                                     |
| [Events page UX](events-page-ux.md)               | 2026-05-18 | Closed UX; architectural regression noted 2026-05-22                                                                                                                                                                                                                                                   |
| [Registration workflow](registration-workflow.md) | 2026-05-24 | Tabs collapsed to single picker + stale dual-CTA closed (Bundle 7); only UX P3 (free-agent claim/grouping), full division→mode→roster→pay wizard, and Payment P2 (captain pre-pay) remain                                                                                                              |

## How findings are graded

| Severity | Meaning                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------- |
| **P1**   | Production-exploitable bug, data-loss risk, or broken user-visible behavior. Fix before next deploy. |
| **P2**   | Important hardening, correctness, or quality issue. Schedule into the next sprint.                   |
| **P3**   | Nice-to-have. Address opportunistically.                                                             |

Each finding has a file link and a concrete recommended fix so it can be
picked up later without re-running the audit.
</content>
</invoke>
