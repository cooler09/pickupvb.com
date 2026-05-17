# Audits

Point-in-time codebase audits. Each file is a snapshot — findings reflect the
state of the repo at the date in the document header. Use them as a backlog
of remediation work, not as a permanent reference. Re-run an audit after you
land its fixes.

| Audit | Date | Status |
|---|---|---|
| [Security](security.md) | 2026-05-17 | Quick-win bundle landed (2026-05-17); rest open |
| [Performance](performance.md) | 2026-05-17 | Quick-win bundle landed (2026-05-17); rest open |
| [Architecture (CQRS/DRY/SOLID)](architecture.md) | 2026-05-17 | Findings logged |
| [508 / Accessibility](accessibility.md) | 2026-05-17 | Findings logged |
| [SEO](seo.md) | 2026-05-17 | Findings logged |
| [Documentation](documentation.md) | 2026-05-17 | Findings logged |
| [Developer project organization](organization.md) | 2026-05-17 | Findings logged |

## How findings are graded

| Severity | Meaning |
|---|---|
| **P1** | Production-exploitable bug, data-loss risk, or broken user-visible behavior. Fix before next deploy. |
| **P2** | Important hardening, correctness, or quality issue. Schedule into the next sprint. |
| **P3** | Nice-to-have. Address opportunistically. |

Each finding has a file link and a concrete recommended fix so it can be
picked up later without re-running the audit.
</content>
</invoke>