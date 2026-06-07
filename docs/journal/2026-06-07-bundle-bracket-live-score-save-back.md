# Bracket live-scoring: save-back from the winner moment (2026-06-07)

## Context

User report: when scoring a bracket/league match on the live scoreboard
(ADR 0023 "Score live"), reaching the match-deciding point pops the
full-screen `WinnerOverlay`, which offers only **Rematch** and **New game** —
the two affordances of the _free_ scoreboard tool. Because the overlay is
`absolute inset-0`, it lands on top of the `SaveToMatchBar`, so the host loses
the one control that records the result back to the bracket. Net effect: at the
exact moment the match is final, there is no way to save it to the schedule —
the host has to back out and enter the result manually.

The two overlay buttons are also semantically wrong when bound: a bracket match
has no "rematch", and "New game" abandons the scoreboard back to the free tool.

## Decisions

- **Make the completion moment the save moment.** Chose to teach
  `WinnerOverlay` about the binding rather than re-stack z-indexes or shrink the
  overlay. When `binding` is present the overlay renders save-back actions
  (`Save final to match` → `Saved to match ✓` + `Back to event`) plus a
  `Re-score` reset, and drops Rematch/New game entirely. The free tool keeps the
  old Rematch/New-game prompt unchanged. This puts the primary CTA where the
  host's attention already is instead of behind the celebration panel.
- **Lift the save action into a shared `useSaveToMatch` hook** rather than
  duplicating the `useTransition`/save/error logic in both the bar and the
  overlay. Both now read one `{ pending, saved, error, onSave, reset }` source,
  so they can never disagree (e.g. the bar behind the overlay also flips to
  "Saved ✓").
- **Clear the saved badge in `onResetMatch`, not in a `winner`-watching
  effect.** First wrote a `useEffect(() => { if (!winner) save.reset() }, …)`,
  but (a) it tripped `react-hooks/exhaustive-deps` (wants the whole `save`
  object) and (b) it's a synchronous-setState-in-effect sync pattern (AGENTS.md
  pattern #5). Since `onPoint` is hard-blocked once `winner` is set, the _only_
  local path from decided→undecided is `onResetMatch`, so resetting the badge
  there is both sufficient and more intentional. The exotic "a peer remote
  resets mid-save" case is left as a negligible stale-badge.
- **Gate the status bar's Save button on `winner`.** The bar button was always
  enabled, so a pre-decision tap hit the record RPC and bounced with "not
  ready". Disabling it until the match is decided makes the overlay the obvious
  save surface and the bar a live-status/fallback.
- **Show the set summary in the overlay** (`25–20 · 25–22`) so the host
  confirms what they're about to save — a small but real improvement to the
  save-back flow.

## Changes

- [scoreboard-view.tsx](../../apps/web/src/app/tools/scoreboard/[code]/_components/scoreboard-view.tsx)
  - New `useSaveToMatch(binding, state)` hook; `SaveToMatchBar` and the new
    `BoundWinnerActions` consume it.
  - `WinnerOverlay` gained a `bound?: { save, returnPath }` prop and a set
    summary; renders `BoundWinnerActions` (Save / Re-score / Back to event)
    when bound, the original Rematch / New game otherwise.
  - `SaveToMatchBar` now takes `save` + `returnPath` (was a self-contained
    `binding`); its Save button is disabled until `winner`.
  - `onResetMatch` clears the saved/error badge.

No domain, application, infrastructure, or SQL changes — this is a web-layer
affordance fix over the existing `finalizeMatchFromScoreboard` action.

## Patterns observed

- **A full-screen `absolute inset-0` overlay silently shadows whatever it
  sits over.** The `SaveToMatchBar` was rendered and correct — just covered.
  When an overlay can appear over an action surface, the overlay has to carry
  (or re-expose) that action, not assume the surface underneath is reachable.

## Follow-ups

- **No automated test added.** The regression is a UI-affordance/layout one
  (which buttons render in which mode), not pure logic — it belongs to a
  Playwright e2e on the Pro-gated "Score live → save to bracket" journey, which
  is deploy-gated and not in the default verify chain. The
  [live-match-scoring initiative](../../) e2e is still the outstanding "does it
  actually work live" gap; this fix should be exercised there.
- **`onPoint` blocks _both_ +1 and −1 once `winner` is set**, so a host can't
  shave a mis-tapped point to undo an accidental match win — only `Re-score`
  (full reset) recovers. Allowing −1 while decided (but never +1) would make
  in-place correction possible without a full reset; deferred as out of scope
  for the save-back fix.
  </content>
  </invoke>
