# M3 surface-container hierarchy — brand-matched ramps (2026-06-07)

## Context

S2 of the M3 re-audit. The surface-container hierarchy
(`md-surface-container-*`, `md-outline*`, `md-on-surface-variant`) shipped in
Bundle 129 but sat at **0 usages** — the next target after the semantic-color
work. Digging into _why_ it stalled surfaced a real blocker, not neglect.

## Decisions

- **Discovered: the surface family can't be M3-generated for this brand, and
  the generated values were off-brand.** Two compounding problems:
  1. The roles were generated from `neutral: '#183334'` (deep teal), producing
     **cool cyan** surfaces (`surface` light = `228 254 255`) — but the brand's
     light surfaces are **warm** (`#F9EBD9` bg / `#EBD6D7` card). Adopting them
     as-is would have recolored every card warm → cyan.
  2. The brand **hue-flips** between themes: warm sand in light, **teal** in
     dark (`#0E2A2C` / `#1B3F42`). An M3 neutral tonal palette is a single hue,
     so it physically cannot emit warm-light + teal-dark. The surface family is
     therefore un-generatable and must be hand-authored.
- **Chose to hand-author the ramps, anchored so `surface-container` == the
  brand card colour** (`#EBD6D7` light / `#1B3F42` dark). That makes
  `bg-surface` → `bg-md-surface-container` a **byte-identical zero-change**
  migration (the brand `--tw-color-surface` and the new
  `--md-sys-color-surface-container` resolve to the same RGB — verified in the
  built CSS), and `on-surface-variant` == `--tw-color-muted` likewise. The
  other steps ramp lighter/darker around the card level for elevation.
- **Guarded the generator instead of deleting the neutral rows.**
  `gen-palette.ts` still emits cool-cyan neutral rows from the seed; rather than
  restructure it, a ⚠️ header documents that only the _chroma_ roles are
  regenerable and the surface block must never be pasted over. Lower-churn than
  splitting the emit, and the guard lives where the next person will paste.
- **Reference adoption demonstrates the ramp without a risky sweep.** Base card
  (account-delete) → `surface-container` (exact zero-change); the two elevated
  Radix surfaces (dialog, menu) → `surface-container-high` (a few RGB units more
  elevated — the correct M3 direction, flagged for an eyeball). The full
  app-wide migration stays a separate visual-review bundle.

## Changes

- [globals.css](../../apps/web/src/app/globals.css) — replaced the cool-cyan
  generated surface/neutral block in **both** `:root` themes with hand-authored
  warm (light) + teal (dark) ramps: `surface`, `surface-variant`,
  `surface-container-{lowest,low,,high,highest}`, `on-surface`,
  `on-surface-variant`, `outline`, `outline-variant`, `background`. Marked
  HAND-AUTHORED with a do-not-regenerate note.
- [scripts/gen-palette.ts](../../scripts/gen-palette.ts) — ⚠️ header: chroma
  roles only; surface family is hand-authored.
- [account/delete/page.tsx](../../apps/web/src/app/profile/account/delete/page.tsx)
  — card `bg-surface` → `bg-md-surface-container`, `text-muted` →
  `text-md-on-surface-variant` (both exact).
- [form-modal.tsx](../../apps/web/src/components/form-modal.tsx) +
  [nav-dropdown.tsx](../../apps/web/src/components/nav-dropdown.tsx) — elevated
  surfaces `bg-surface` → `bg-md-surface-container-high`.
- [AGENTS.md](../../AGENTS.md) — extended pattern 17 with the hand-authored
  caveat + the recommended elevation level-map.

## Patterns observed

- **A brand whose surfaces hue-flip per theme breaks M3's single-neutral-seed
  model.** Worth remembering for any future palette regen: the chroma roles
  generate cleanly, the neutral/surface family does not. The audit + AGENTS.md
  now record this so nobody re-runs `gen-palette.ts` and clobbers the warm/teal
  ramps with cyan.
- **Anchoring a new token to an existing one's exact RGB turns a "visual
  restyle" into a zero-change rename.** Same trick as the type scale's
  `text-2xl` → `headline-sm`: pick the anchor so the highest-traffic migration
  (`bg-surface` → `bg-md-surface-container`) is provably identical, then the
  _new_ capability (the lighter/darker steps) is opt-in.

## Follow-ups

- **App-wide surface migration (open, now unblocked)** — assign elevation
  levels per surface (`page`=surface, card=container, dialog/menu/raised=high,
  nested=highest), `border-border-base` → `border-md-outline-variant`,
  `text-muted` → `text-md-on-surface-variant`. A **visual-review** bundle:
  zero-change for the bg/text swaps, but the border swap adds a faint light-mode
  hairline that wants eyes in both themes.
- **Eyeball the dialog/menu** `surface-container-high` in dark mode — the teal
  elevation step is subtle; confirm it reads as "raised," not "off."
- **Status pills + destructive text-links** (the prior bundle's deferred items)
  remain.

## Verify

15/15 typecheck · lint 0 errors / 3 pre-existing `set-state-in-effect`
warnings · 268 web tests (+ domain/application) · 8/8 build · built-CSS confirms
the warm/teal ramps ship and `--md-sys-color-surface-container` == the brand
`--tw-color-surface` in both themes (the zero-change proof).
