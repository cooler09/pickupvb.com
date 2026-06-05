# Bracket workflow redesign — create/config UI (2026-06-02)

## Context

Phase 3 of the bracket redesign ([ADR 0032](../adr/0032-bracket-workflow-redesign.md)),
after the [domain](2026-06-02-bundle-bracket-workflow-redesign-domain.md) and
[commands](2026-06-02-bundle-bracket-workflow-redesign-commands.md) bundles. This
surfaces the new config in the **create** form so a host can configure a
tournament the way they actually run it: a point total per game, a different
match length for the playoff than for pool play, and a rec "everyone plays ~N
games" schedule that no longer caps at pool size.

This is the bracket **create/config** surface only — the draft-editing workspace
and live-board edits (where the manual-override mutators become visible) are
Phase 4/5.

## Decisions

- **Target score ("Play to") on every format**, defaulting to 25. It's
  informational (ADR 0032 — recorded + shown, not enforced by scoring), so a
  number input with a 25 placeholder beats a fixed 25/21/15 chip set. Empty ⇒
  unset (null). New brackets now carry `targetScore: 25`; existing rows stay
  null and are unaffected.
- **Playoff-stage length is a `pool_play_playoff`-only override** rendered inside
  the pool-play fieldset: a best-of `<select>` defaulting to "Same as pool play"
  (`''` ⇒ null ⇒ fall back to pool best-of) plus an optional "Play to". Encodes
  the canonical "best-of-1 pool play, best-of-3 playoff" setup.
- **Dropped the `fixed_games` "< smallest pool" guard from the UI.** ADR 0032
  relaxed the domain to allow repeats, so the form no longer blocks (or clamps)
  `gamesPerTeam ≥ pool size`; the field is now "Games per team" with copy
  explaining opponents repeat in small/uneven pools. Removed `fixedGamesInvalid`
  and its submit-disable + inline error.
- **Estimate is now pool-size-agnostic for target-games** — `teams × g / 2`
  rounded (each team plays ~g games), instead of the old `perPool × g / 2`
  capped at full RR.
- **Both create paths parse the new fields.** The picker is shared, so the
  standalone create (`parseConfig` in [brackets/actions.ts](../../apps/web/src/app/brackets/actions.ts))
  gets the same `target_score` / `playoff_best_of` / `playoff_target_score`
  parsing as the event path
  ([bracket/actions.ts `createBracketFromForm`](../../apps/web/src/app/events/[id]/bracket/actions.ts))
  — otherwise a standalone host's "play to 21" would be silently dropped.

## Changes

- **format-picker-form.tsx** — `targetScore` / `playoffBestOf` /
  `playoffTargetScore` state; "Play to" input in the (now stage-aware) match-length
  fieldset; "Playoff match length" sub-section for pool play; "Games per team"
  copy + un-clamped input; updated `estimateMatches` fixed-games branch; removed
  `fixedGamesInvalid`.
- **events/[id]/bracket/actions.ts** — `createBracketFromForm` parses
  `target_score` (all formats) + `playoff_best_of` / `playoff_target_score`
  (pool play).
- **brackets/actions.ts** — same parsing in the shared `parseConfig`.

## Patterns observed

- **A shared form needs every consumer's action updated together.** The
  format-picker feeds two server actions (event `createBracketFromForm` +
  standalone `parseConfig`); adding fields to the form without updating both
  drops data on one path with no error. Grep the form's field `name`s against all
  actions that consume it.

## Follow-ups

- **Phase 4 — draft workspace** is the next and highest-impact step: the
  generate handler still auto-`publish()`es (no draft UI yet), so the
  manual-override mutators (Phase 2) aren't reachable by a host. Building the
  draft-editing workspace + server actions over `publishBracket` /
  `editBracketMatch` / `setBracketPools` / … unlocks them and lets the
  create-form copy honestly mention post-generate editing.
- **Surface `targetScore` on the board / scoreboard** (per-match effective
  value) — informational display, Phase 5.
- gen:types (local DB) still pending.

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(15/15 tasks; domain 479, application 106, infra 48, web 214). Lint 0 errors
(pre-existing warnings only). No new unit test — the bracket actions have no
existing test harness and the parsing is straightforward guarded `FormData`
reads; the create flow is covered by the deferred Phase 6 e2e.
