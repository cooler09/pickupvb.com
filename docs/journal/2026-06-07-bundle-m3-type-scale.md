# M3 type-scale adoption + ratchet (2026-06-07)

## Context

The 2026-06-07 M3 re-audit ([docs/audits/m3-alignment.md](../audits/m3-alignment.md))
found the design-system program **regressing**: the M3 type scale shipped in
Bundle 129 but sat at **0/15 roles adopted**, while raw `text-Nxl` _grew_
77 → 120 in 8 days for lack of a lint guard (finding S1, root cause S0). The
type scale was singled out as the cheapest, zero-dark-mode-risk first bundle
(it's just font-size + line-height). This bundle closes S1.

## Decisions

- **Chose a full `text-Nxl` migration (120 sites → roles) over "top headings
  only," because the only effective ratchet is `error`, and `error` requires
  the bucket at zero.** A `warn` ratchet (the audit's first suggestion)
  turned out **infeasible**: ESLint flat config can't run one rule at two
  severities, and a second `no-restricted-syntax` config object _replaces_
  (not merges) the existing `error` locks — so a `warn` rule would have
  silently downgraded the shape/button/field ratchets. The repo's proven
  Bundle-139 pattern (migrate-the-bucket-to-zero, then `error`-ratchet)
  applied cleanly because `text-Nxl` is bounded (120, same order as shape's
  162).
- **Chose nearest-role mapping to minimize visual drift.** `text-2xl →
text-headline-sm` is **exact** (both 24px/32px, no tracking) — a true
  zero-change codemod and the spine of the bundle (55 sites, mostly existing
  h2/h3 section headers). The rest carry ≤2–3px intended refinements:
  `text-xl→title-lg` (20→22), `text-3xl→headline-lg` (30→32, the canonical
  page-title role — ~28 page `<h1>`s were a uniform `text-3xl font-bold`),
  `text-4xl→display-sm` (36, exact size), `text-5xl→display-md` (48→45),
  `text-6xl→display-lg` (60→57).
- **Did NOT touch `text-{sm,lg,xs,base}` (1423 sites).** Body/caption scale
  is a genuine flood and its role mapping is judgment, not 1:1 — deferred to
  its own bundle (S0), un-ratcheted for now.

## Changes

- **75 files under [apps/web/src](../../apps/web/src)** — codemod
  (`\btext-Nxl\b`, null-delimited `xargs` + `perl`) swapping each raw size
  token for its M3 type role. Weight / `leading-*` / `tracking-*` preserved
  alongside the role class.
- [apps/web/eslint.config.mjs](../../apps/web/eslint.config.mjs) — two
  `no-restricted-syntax` selectors (Literal + TemplateElement) locking the
  now-eliminated `text-(xl|[2-9]xl)` family at `error`. Whole-token boundary
  so `text-display-*` / `-headline-*` / `-title-*` and the un-ratcheted
  `text-{sm,lg,xs,base}` aren't false-positives.
- [AGENTS.md](../../AGENTS.md) — new **pattern 16** with the raw→role mapping
  table so new headings use roles.
- [docs/audits/m3-alignment.md](../audits/m3-alignment.md) + index — S1 →
  🟢 Resolved, S0 → 🟡 (text-Nxl closed), remediation-log entry.

## Patterns observed

- **A `warn`-severity ratchet can't coexist with an `error`
  `no-restricted-syntax` block** (one rule = one severity; later config
  object replaces). Corollary: the repo's lint-ratchet strategy is
  _intrinsically_ migrate-to-zero-then-`error` — there is no "warn first,
  migrate later" half-step. Promoted to the reasoning behind pattern 16.
- **The `@theme inline` type tokens _do_ generate utilities** — they'd never
  been used, so Tailwind had never emitted them, which is why the re-audit
  saw "0 adoption." Confirmed in the production build:
  `.text-headline-sm{font-size:1.5rem;line-height:var(--tw-leading,2rem)}`.
  The `var(--tw-leading,…)` fallback means an explicit `leading-*` still
  overrides the role's line-height — so heroes with `leading-tight` kept it.
  Worth a built-CSS grep whenever adopting a previously-unused `@theme` token
  (a green `typecheck/lint/test/build` does **not** catch a non-emitting
  utility — it's a silent visual regression).

## Follow-ups

- **Palette / surface-container migration (S2)** — the next highest-value
  bundle (it's the dark-mode motivation; 555 raw palette utils, surface
  roles at ~0 adoption). Judgment-heavy → its own visual-review bundle, then
  ratchet palette.
- **`text-{sm,lg,xs,base}` body scale (S0)** — deferred; 1423 sites, judgment
  mapping.
- **`shadow-*`→`shadow-elevation-*` (S3)** and **`rounded-md` (P2 #7)** —
  opportunistic, fold into the S2 visual-review pass.
- **Visual smoke-check** of the marquee heroes (home / pricing / pro /
  about-numbers) recommended — the non-`text-2xl` buckets carry ≤3px intended
  size shifts that the quad doesn't validate.

## Verify

15/15 typecheck · lint 0 errors / 3 pre-existing `set-state-in-effect`
warnings · 268 web tests (+ domain/application suites) · 8/8 build ·
built-CSS grep confirms type-role utilities emit font-size + line-height.
