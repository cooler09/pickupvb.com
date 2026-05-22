# Audits

Point-in-time codebase audits. Each file is a snapshot — findings reflect the
state of the repo at the date in the document header. Use them as a backlog
of remediation work, not as a permanent reference. Re-run an audit after you
land its fixes.

For the narrative behind each remediation bundle (decisions, rejected
alternatives, patterns observed), see [docs/journal/](../journal/).

| Audit                                             | Date       | Status                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Security](security.md)                           | 2026-05-22 | Bundle 17 (2026-05-24): P3 #9 + #10 — global 4 KB `FormData` cap in `form-data.ts`; Turnstile `challenge_ts` freshness check (≤2 min). CSP enforcement (P2 #3a), P3 #8 audit-log coverage, and P3 #11 preemptive upload hardening still open |
| [Performance](performance.md)                     | 2026-05-22 | Bundle 13a (2026-05-24): P1 #1 partially resolved — `/players`, `/groups`, `/teams` ISR-cacheable via sessionless anon client + client viewer-chrome. `/events` + all `/[id]` detail pages + P3 #13 still open                               |
| [Architecture (CQRS/DRY/SOLID)](architecture.md)  | 2026-05-22 | New P2s (revalidatePath; billing typed errors); page-diet regressed                                                                                                                                                                          |
| [508 / Accessibility](accessibility.md)           | 2026-05-22 | Mobile menu focus trap + shared FieldError landed 2026-05-22 (Bundle 2)                                                                                                                                                                      |
| [SEO](seo.md)                                     | 2026-05-24 | Bundle 18 shipped `BreadcrumbList` JSON-LD (P3) across all 4 detail pages; force-dynamic Suspense refactor (P2) still deferred                                                                                                               |
| [Documentation](documentation.md)                 | 2026-05-22 | AGENTS Audits section landed 2026-05-22; ADR backfill + READMEs still open                                                                                                                                                                   |
| [Developer project organization](organization.md) | 2026-05-17 | Shared ESLint flat config landed 2026-05-24 (Bundle 8) — closes P1 #1 lint coverage; test-scripts P1 + P2s remain                                                                                                                            |
| [Events page UX](events-page-ux.md)               | 2026-05-18 | Closed UX; architectural regression noted 2026-05-22                                                                                                                                                                                         |
| [Registration workflow](registration-workflow.md) | 2026-05-24 | Tabs collapsed to single picker + stale dual-CTA closed (Bundle 7); only UX P3 (free-agent claim/grouping), full division→mode→roster→pay wizard, and Payment P2 (captain pre-pay) remain                                                    |

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
