# Tournament-tools workflow audit

_Last updated: 2026-06-10_

**Status update (2026-06-10) — division-bracket-page UX/UI deep-dive.**
Full read of the host/captain division-bracket workspace
(`/events/[id]/bracket?division=…`) and its shared `_components`, through a
**UX/UI** lens (bugs, gaps, streamlining, a11y, M3/stale-code) — distinct from
the TT-\* correctness/parity backlog below, which is fully closed. **15 findings
UX-1 … UX-15 (5 P2 · 10 P3)** in the new "Division bracket page — UX/UI
deep-dive" section below (UX-15 surfaced while fixing UX-2). **Two bundles
shipped 2026-06-10 (uncommitted), both quad-green:**

- **Bundle 1:** UX-1 (host spectator-copy flash), UX-3 + UX-4 (the two a11y
  gaps), UX-9 (per-division tab status pills + shared `DivisionTabs`).
- **Bundle 2:** UX-2 (drop the no-op "Discard"), UX-5 (`errorButtonClass`), UX-6
  (notice → `<Alert>`), UX-7 (h1 → `headline-lg`).

See the remediation log. Remaining UX backlog: **UX-15** (P2 — event-bracket
delete / format-change) + **UX-8, UX-10…14** (6 × P3).

**Status update (2026-06-05) — bracket-tool deep-dive (standalone vs. division).**
Full written audit of the bracket engine + both delivery surfaces (event/division
under `/events/[id]/bracket`, standalone under `/brackets`), read through a
correctness / parity / stale-data lens. Nine new findings **TT-9 … TT-17** below
(**1 P1 · 3 P2 · 5 P3**). Headlines:

- **TT-9 (P1) — ✅ FIXED 2026-06-05.** Double-elimination create/seed accepted team
  counts the generator can't build (min-teams said 3, generator needs ≥4 **and** a
  power of two); the failure only surfaced at Generate. Now enforced up-front via a
  shared domain precondition. See the remediation log below.
- **TT-10 (P2) — ✅ FIXED 2026-06-05.** A completed standalone bracket could never
  be re-opened (no standalone reopen; the board's Re-open was event-only). Added an
  owner-gated standalone reopen + surfaced the Re-open strip for standalone. See the
  remediation log below.
- **TT-11 (P2) — ✅ FIXED 2026-06-05.** Standalone brackets now have the full
  division-path ADR-0032 draft → publish flow + live manual edits (per-match Edit,
  Substitute, add/remove match, Edit pools). Auto-publish removed; the draft/edit
  UI was parameterized on `BracketScope`. The flow change closed **TT-13 / TT-14 /
  TT-15** as riders (LIVE/Final badge gating, `targetScore` on the standalone
  board/watch, the `draft` status label). See the remediation log below.
- **TT-12 (P2) — ✅ FIXED 2026-06-05.** The free-tier cap copy promised "delete your
  bracket" but no delete path existed. Added an owner-gated delete (cascade) + a
  danger-zone affordance on `/brackets/[id]`; the cap copy is now accurate. See the
  remediation log below.

**TT-13 / TT-14 / TT-15 / TT-16 / TT-17 — ✅ all FIXED 2026-06-05** (TT-13/14/15 as
TT-11 riders; TT-16 per-pool feasibility + TT-17 DE grand-final disclosure as a
final P3 pass). **The entire TT-9 … TT-17 bracket-audit backlog is now resolved
in-tree.**

The two prior P1s are landed in-tree (TT-7 scope-XOR fix migration
`20260912000000` committed in `03ab610f`; TT-8 double-elim loser-advance in
`bracket.ts` committed in `ac43501f`) — verify on the next deploy.

**Status update (2026-06-04) — two P1 bracket bugs surfaced by the persona
e2e run** (`standalone-bracket`, `persona-sofia-tournament`). Both are real
correctness bugs in the shipped bracket engine, not test drift. Fixes below;
full narrative in
[journal 2026-06-04](../journal/2026-06-04-bundle-persona-e2e-real-bugs.md).

- **P1 TT-7 — every standalone bracket op 500s on a scope-XOR violation.**
  `save_bracket()`'s header write (the 20260908000000 rewrite) is
  `insert … on conflict (id) do update`. Postgres evaluates the
  `event_brackets_scope_xor` CHECK on the **proposed insert tuple** before the
  arbiter routes to DO UPDATE; for a standalone bracket that tuple is
  `owner_user_id = NULL` + `division_id = NULL` → violation → the whole
  create/seed/generate/record aborts. Event-scoped brackets (non-NULL
  `division_id`) are unaffected. Reproduced against dev. **Fix:** migration
  [20260912000000](../../supabase/migrations/20260912000000_fix_save_bracket_standalone_scope_xor.sql)
  — header step rewritten as `update … ; if not found then insert` so no
  NULL-owner tuple is ever CHECK-evaluated (signature + steps 2–4 unchanged).
  Deploy-gated.
- **P1 TT-8 — double elimination silently degenerates into single
  elimination.** `Bracket.applyAdvancement`
  ([bracket.ts](../../packages/domain/src/brackets/bracket.ts)) placed only the
  **winner** into its next match — it ignored `loserAdvancesToMatchId` /
  `loserAdvancesToSlot`, which the generator _does_ wire
  ([generators.ts](../../packages/domain/src/brackets/generators.ts):369/:382).
  So the losers bracket + grand final never received teams and stayed unplayable
  (a 4-team DE played only the 3 winners-bracket matches). `unwireAdvancement`
  had the mirror gap (never pulled a dropped loser back out on reset/re-record).
  **Fix:** `applyAdvancement` drops the loser into its LB slot; `unwireAdvancement`
  seeds its cascade with both edges (keyed `matchId:slot`). Single-elim /
  pool-play unaffected (NULL loser edges). 2 domain tests added
  ([bracket.test.ts](../../packages/domain/src/brackets/bracket.test.ts)).
  Deploy-gated for the Sofia e2e; unit-verified now.

Feature-scoped audit of the **tournament-running tool suite** — the host's
divisions/bracket/schedule surfaces under `/events/[id]/*` and the standalone
host tools under `/tools/*` (team randomizer, round-robin scheduler, seeding,
standings, court rotation, match timer, live scoreboard) — read through the
**persona / workflow** lens.

Complementary to, not a duplicate of:

- [persona-ux.md](persona-ux.md) — site-wide CTA/field vocabulary + persona
  journeys. This file is feature-scoped to the tools↔event workflow.
- [m3-alignment.md](m3-alignment.md) — token/primitive conformance.
- [event-data-model.md](event-data-model.md) — the bracket/match write paths and
  their RLS posture (the commands this audit's tie-back reuses).

> **Scope note:** full written audit (not a quick scan). Findings graded
> P1/P2/P3 per [README.md](README.md), each with a file link + concrete fix. The
> 2026-06-02 bundle implements TT-1/TT-2 (quick links + event tie-back); see the
> **Remediation log** at the bottom.

---

## The personas (as they touch the tools)

| Persona                         | Where they are                                                         | What they need                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Host running a tournament**   | `/events/[id]/manage`, `/events/[id]/bracket`, `/events/[id]/schedule` | The tools **where they run the event**, pre-filled with the event's roster/teams, with results landing back on the official record |
| **Casual organizer (no event)** | `/tools/*`                                                             | A no-signup utility that just works — and a clear path to "do this for real" (tie to an event) when they're ready                  |
| **Spectator / player**          | `/events/[id]/bracket/watch`, scoreboard `/s/[code]`                   | Read-only live state (already served well)                                                                                         |

---

## Root-cause theme: the tools and the event suite are two disconnected halves

The event domain already owns rich, RLS-gated write paths for everything the
standalone tools compute:

| Standalone tool                 | Event-domain equivalent it duplicates                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/seeding`                 | `SeedBracketCommand` + [`seeding-list.tsx`](../../apps/web/src/app/events/[id]/bracket/_components/seeding-list.tsx)                                              |
| `tools/scheduler` (round-robin) | pool-play generation — `GenerateBracketCommand` (`pool_play_playoff` + `poolSchedule: round_robin`)                                                               |
| `tools/team-randomizer`         | `RegisterAdHocTeamCommand` / `addWalkInTeam` ([`bracket/actions.ts`](../../apps/web/src/app/events/[id]/bracket/actions.ts#L360))                                 |
| `tools/standings`               | auto-derived standings + [`HostDivisionWinnersPanel`](../../apps/web/src/app/events/[id]/_components/host-division-winners-panel.tsx) / `recordDivisionPlacement` |

Only the **scoreboard** bridges the two halves — via `ScoreLiveButton` →
`MatchBinding` → `finalizeMatchFromScoreboard`
([binding.ts](../../apps/web/src/app/tools/scoreboard/_lib/binding.ts),
[score-live-button.tsx](../../apps/web/src/app/events/[id]/_components/score-live-button.tsx),
[finalize-actions.ts](../../apps/web/src/app/tools/scoreboard/[code]/finalize-actions.ts)).
That binding pattern is the model the rest of the suite should copy; today the
other six tools are dead-ends that emit copy-paste text.

---

## Findings

### TT-1 — Discovery gap: the standalone tools are invisible from the event surfaces · **P2**

The host's command center —
[manage-dashboard.tsx](../../apps/web/src/app/events/[id]/manage/_components/manage-dashboard.tsx)
"Run the event" group — links only to **Bracket** and **Schedule**. There is no
in-context link to the randomizer, scheduler, seeding, standings, timer, or
rotation tools. They're reachable only from the global "Host tools" nav
([site-header.tsx#L140](../../apps/web/src/components/site-header.tsx#L140)), so
a host mid-tournament has to leave their event, find the tool, and copy data by
hand. The bracket page header
([bracket/page.tsx#L116-L136](../../apps/web/src/app/events/[id]/bracket/page.tsx#L116-L136))
has the same gap.
**Fix:** a "Tools" quick-links card in the manage dashboard's Run-the-event group
and a tools row on the bracket page, each launching `/tools/<tool>` with the
event/division bound via query string.

### TT-2 — Disconnection: tool output is a dead-end, not an event write · **P2**

Per the root-cause table, a host who uses a standalone tool while running an
event gets a text blob they must re-key into the event. The event domain already
has the write path for each (`SeedBracketCommand`, `RegisterAdHocTeamCommand`,
`recordDivisionPlacement`, pool-play generation), all host/captain-authorized in
their handlers + RLS — they're simply not reachable from the tools.
**Fix:** generalize the scoreboard's `MatchBinding` into an `EventToolBinding`
(`?event=&division=&ret=`). When bound, a tool's server `page.tsx` pulls the
event's roster/teams (gated on `event.canManage`), pre-fills the island, and
offers a "Save to event" action that calls the existing command:

- randomizer → `RegisterAdHocTeamCommand` per generated team
- seeding → `SeedBracketCommand` (apply the computed order)
- standings → `recordDivisionPlacement` for the top 3
- scheduler → deep-link into the bracket's pool-play config (the domain
  generates pool matches; it has no "save arbitrary matchups" write — see TT-5)

### TT-3 — A tool launched while running an event shows no connection to it · **P3**

The `/tools/*` pages are framed as standalone no-signup utilities and have no
affordance acknowledging they were opened from an event. A host who clicks
through from their event sees the generic tool with no "you're working on _Event
X_" context and no way back.
**Fix:** when an `EventToolBinding` is present, render a "Connected to _Event_"
banner above the tool with the save + "Back to event" actions. Absent the
binding the page is byte-identical to today (preserves the SEO/no-signup
posture).

### TT-4 — Two homes for the same job (seeding / standings) · **P3**

Seeding and standings overlap heavily with bracket built-ins: the bracket page
already reseeds via [seeding-list.tsx](../../apps/web/src/app/events/[id]/bracket/_components/seeding-list.tsx)
and standings are auto-derived from recorded results. Without a clear "feeder vs.
canonical" story, a host won't know whether to use the tool or the bracket.
**Fix (positioning, not code):** treat the standalone seeding/standings as
**feeders into the bracket** — the bracket page stays the canonical surface; the
tool's only event-bound action is "apply to the bracket / record the podium."
Document this so the two surfaces don't compete. The genuinely net-new tie-back
is **randomizer → ad-hoc teams** (no equivalent quick path exists on the event
side today) and the **discovery quick links** (TT-1).

### TT-5 — Scheduler has no domain write path for arbitrary matchups · **P3**

The standalone scheduler emits a free-form round-robin slate, but the bracket
domain **generates** pool matches from a `pool_play_playoff` config and only
allows **reordering** them afterward (`ReorderPoolMatchesCommand`) — there is no
command to insert an arbitrary externally-authored schedule.
**Fix:** the scheduler's event tie-back is a **deep-link** into
`/events/[id]/bracket` with the pool-play format + court labels pre-filled, not a
write. Documented honestly so a future contributor doesn't try to wire a
non-existent "save schedule" command.

### TT-6 (positive) — The scoreboard binding is the model to copy

[binding.ts](../../apps/web/src/app/tools/scoreboard/_lib/binding.ts) +
[finalize-actions.ts](../../apps/web/src/app/tools/scoreboard/[code]/finalize-actions.ts)
already prove the whole pattern: a tool that is the plain free tool when unbound
and an event-connected tool when it carries a binding, re-checking authorization
server-side and reusing the unchanged domain commands. The `EventToolBinding`
generalization (TT-2) should mirror it shape-for-shape.

---

## Bracket-tool deep-dive (2026-06-05) — standalone vs. division

Scope: the `Bracket` aggregate + generators, the event/division surface
(`/events/[id]/bracket`), and the standalone surface (`/brackets`). Findings
focus on **correctness, standalone↔division parity, and stale data** — distinct
from the persona tie-back (TT-1…TT-6) above.

### TT-9 — Double-elimination accepts team counts the generator can't build · **P1**

The create-time gate and the generator disagree on what a valid double-elim
field is, and nothing surfaces the gap until **Generate**:

- `minTeamsForFormat('double_elimination')` returns **3**
  ([enums.ts#L45-L56](../../packages/domain/src/brackets/enums.ts#L45-L56)), and the
  format picker's `FORMATS` entry likewise advertises `minTeams: 3`
  ([format-picker-form.tsx#L166-L173](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx#L166-L173)).
- But `generateDoubleElimination` requires **N ≥ 4 _and_ N a power of two**
  (4/8/16/32) — it throws `ValidationError` otherwise
  ([generators.ts#L303-L314](../../packages/domain/src/brackets/generators.ts#L303-L314)).
- `CreateBracketHandler` validates only against `minTeamsForFormat`
  ([bracket.handler.ts#L253-L260](../../packages/application/src/commands/bracket.handler.ts#L253-L260)),
  so a host can create + seed a DE bracket with 3, 5, 6, 7, 9–15 … teams and only
  hit the wall at `generate()`, which redirects back with a cryptic "requires a
  power-of-two team count".

Impact splits by surface:

- **Division:** registered team count is driven by registrations, so a
  5/6/7-team division simply **cannot** run double-elim — the host is stuck at
  Generate with no path except switching format (which needs a reset).
- **Standalone:** worse — format is fixed at create, the free owner is at the
  1-bracket cap, and there's **no delete** (TT-12), so a free user who picks DE
  with 6 teams is hard-stuck. The standalone create page passes `teamCount={0}`
  - `enforceMinTeams={false}`
    ([new/page.tsx#L62-L67](../../apps/web/src/app/brackets/new/page.tsx#L62-L67)),
    so there isn't even a min-team hint.

**Fix:** (a) bump `minTeamsForFormat('double_elimination')` to **4** and sync the
picker's `minTeams`; (b) add a power-of-two precondition surfaced at create **and**
at the SetupView Generate gate — disable Generate and show "Double elimination
needs 4, 8, 16, or 32 teams; you have N" (compute nearest pow2)
([setup-view.tsx#L56-L80](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx#L56-L80));
(c) have `CreateBracketHandler` validate against the generator's real precondition,
not just a count. Longer-term, support non-power-of-two DE (byes in WB R1) so
common counts work — that's the durable fix.

### TT-10 — A completed standalone bracket can never be re-opened or edited (data dead-end) · **P2** · ✅ FIXED 2026-06-05

There is no standalone reopen command/action, and the only Re-open affordance —
`LiveHostTools` on the board — is gated `scope.kind === 'event'`
([board-view.tsx#L191-L198](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx#L191-L198),
[#L445-L477](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx#L445-L477)).
Once a standalone bracket reaches `completed`, `recordResult` / `resetMatch`
throw ("Bracket is not active." / "Cannot edit a completed bracket."
[bracket.ts#L572](../../packages/domain/src/brackets/bracket.ts#L572),
[#L619](../../packages/domain/src/brackets/bracket.ts#L619)) and the board hides
Reset (active-only, [board-view.tsx#L170](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx#L170)).
A mis-entered final that completes the bracket is then **frozen forever** — no
correction, no undo. The domain already supports the fix (`Bracket.reopen()`,
[bracket.ts#L404-L410](../../packages/domain/src/brackets/bracket.ts#L404-L410)); it's
just unreachable from standalone.
**Fix:** add an owner-gated `ReopenStandaloneBracketCommand` + handler +
`reopenStandaloneBracket` action (mirror `ReopenBracketHandler`), and render a
Re-open affordance for `scope.kind === 'standalone'` (un-gate the
`LiveHostTools` reopen branch or add a standalone strip).

### TT-11 — Standalone brackets lack the division path's draft + manual-edit tooling (parity gap) · **P2** · ✅ FIXED 2026-06-05

The ADR-0032 manual-edit suite (publish/reopen/setPools/editMatch/addMatch/
removeMatch/seedPlayoff/replaceEntry) exists **only** for event/division
brackets ([bracket.handler.ts#L369-L538](../../packages/application/src/commands/bracket.handler.ts#L369-L538));
the standalone handler set
([standalone-bracket.handler.ts](../../packages/application/src/commands/standalone-bracket.handler.ts))
has none of them. Consequences for a standalone owner:

- **No draft stage.** Standalone `generate()` auto-publishes
  ([standalone-bracket.handler.ts#L160-L168](../../packages/application/src/commands/standalone-bracket.handler.ts#L160-L168)),
  so it jumps `setup → active` with no pre-publish review. `DraftWorkspace` is
  hard-coupled to `eventId`/`divisionId`
  ([draft-workspace.tsx#L34-L45](../../apps/web/src/app/events/[id]/bracket/_components/draft-workspace.tsx#L34-L45))
  and never rendered for standalone (the standalone page has no `draft` branch —
  [brackets/[id]/page.tsx#L109-L139](../../apps/web/src/app/brackets/[id]/page.tsx#L109-L139)).
- **No live structural edits.** `canStructEdit`, the per-match `MatchEditor`
  "Edit", and Substitute are all `scope.kind === 'event'`-gated
  ([board-view.tsx#L83-L104](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx#L83-L104)).
  A standalone owner can seed, generate, reset (while active), record/clear
  results, and generate the playoff — nothing else.

**Fix:** mirror the event manual-edit handlers as owner-gated standalone commands
(reuse `loadOwnedBracket`), extend `bindBracketActions`
([bracket-action-binding.ts#L59-L88](../../apps/web/src/app/events/[id]/bracket/_components/bracket-action-binding.ts#L59-L88))
with the new standalone bindings, and un-gate the board affordances by switching
the `scope.kind === 'event'` checks to "is the action bound for this scope".
Parameterize `DraftWorkspace` on a `BracketScope` so standalone can render it. This
is the deferred "Standalone (ADR 0025) draft/edit UI" — promote it from
nice-to-have to a tracked P2 because TT-10 (the no-reopen dead-end) rides on it.

### TT-12 — "Delete your bracket" is promised but unimplemented · **P2** · ✅ FIXED 2026-06-05

The cap copy and its JSDoc both tell the user to "Finish or **delete** your
current bracket"
([standalone-bracket-cap.ts#L13-L24](../../apps/web/src/lib/standalone-bracket-cap.ts#L13-L24)),
and the `/brackets/new` cap panel repeats it
([new/page.tsx#L68-L84](../../apps/web/src/app/brackets/new/page.tsx#L68-L84)). But
there is **no delete-bracket action anywhere** — a repo-wide search finds only
`removeBracketMatch` (a single match, event-scope). Combined with TT-9 / TT-10, a
free owner with a non-generatable or unwanted bracket cannot free their one slot
short of upgrading to Pro.
**Fix:** add an owner-gated `DeleteStandaloneBracketCommand` + handler + a
"Delete bracket" affordance on `/brackets/[id]` (and the list), cascading
`bracket_teams` / `bracket_seeds` / `bracket_matches` / `bracket_match_sets`.
Until it ships, change the copy to stop promising deletion.

### TT-13 — Standalone watch page hard-codes "● LIVE", never shows "Final" · **P3** · ✅ FIXED 2026-06-05 (TT-11 rider)

`/brackets/[id]/watch` renders the `● LIVE` badge **unconditionally**, regardless
of status ([watch/page.tsx#L74-L79](../../apps/web/src/app/brackets/[id]/watch/page.tsx#L74-L79)),
so a completed standalone bracket still claims to be live. The event watch page
gets this right — LIVE only when `status === 'active'`, a green "Final" badge on
`completed`
([events/[id]/bracket/watch/page.tsx#L163-L175](../../apps/web/src/app/events/[id]/bracket/watch/page.tsx#L163-L175)).
**Fix:** mirror the event gating on the standalone watch header.

### TT-14 — Standalone board/watch never pass `targetScore` (configured "play-to" is invisible) · **P3** · ✅ FIXED 2026-06-05 (TT-11 rider)

The ADR-0032 "play to N points" the owner configures is dropped on the standalone
surfaces: both standalone `BoardView` calls omit `targetScore`
([brackets/[id]/page.tsx#L126-L137](../../apps/web/src/app/brackets/[id]/page.tsx#L126-L137),
[watch/page.tsx#L104-L115](../../apps/web/src/app/brackets/[id]/watch/page.tsx#L104-L115)),
so `MatchCard` only shows a "to N" line when a **per-match** override is set
([match-card.tsx#L62-L69](../../apps/web/src/app/events/[id]/bracket/_components/match-card.tsx#L62-L69)).
The event path passes `bracket.config.targetScore`.
**Fix:** pass `targetScore={bracket.config.targetScore}` in both standalone
`BoardView` calls (and `teams={registeredTeams}` once standalone edit lands).

### TT-15 — Status labels omit `draft` (latent until TT-11) · **P3** · ✅ FIXED 2026-06-05 (TT-11 rider)

The `/brackets` list `STATUS_LABEL` map handles only setup/active/completed
([brackets/page.tsx#L10-L14](../../apps/web/src/app/brackets/page.tsx#L10-L14)), and
the standalone editor/watch status branches likewise have no `draft` case.
Standalone auto-publishes today so it's latent, but the list already falls
through to the raw `draft` string, and it becomes a visible gap the moment
standalone draft (TT-11) lands.
**Fix:** add `draft: 'Draft'` and a draft render branch wherever standalone
status is shown — bundle with TT-11.

### TT-16 — Pool-play create gate ignores `advancePerPool`; uneven pools can fail playoff generation · **P3** · ✅ FIXED 2026-06-05

`CreateBracketHandler` checks only `minTeamsForFormat` (4 for pool play), not
`poolCount * advancePerPool`
([bracket.handler.ts#L253-L260](../../packages/application/src/commands/bracket.handler.ts#L253-L260)).
`generate()` catches the **global** under-fill
([bracket.ts#L348-L362](../../packages/domain/src/brackets/bracket.ts#L348-L362)) and
the picker warns (`poolPlayUnderfilled`), so this is mostly defense-in-depth — but
with **hand-assigned uneven pools** (`setPools`), one small pool with fewer than
`advancePerPool` finishers makes `rankAcrossPools` throw "missing position N"
([standings.ts#L158-L167](../../packages/domain/src/brackets/standings.ts#L158-L167))
even when the global count passes.
**Fix:** validate per-pool advance feasibility in `generatePlayoff` (and surface it
at `setPools`/Edit-pools time) with a message naming the short pool; factor the
config into the create handler's min-team check.

### TT-17 (note) — Double-elimination grand final has no bracket reset · **P3 (documented limitation)** · ✅ DISCLOSED 2026-06-05

The v1 grand final is a single match
([generators.ts#L283-L293](../../packages/domain/src/brackets/generators.ts#L283-L293)):
if the losers-bracket winner (one loss) beats the winners-bracket winner (zero
losses), the WB team is eliminated on a **single** loss — not true double-elim,
which would grant a reset game. Acceptable as a v1 limitation but currently
undisclosed.
**Fix:** disclose it in the format picker ("single grand final, no reset") and put
"grand-final reset" on the roadmap. **✅ The reset grand final was implemented
2026-06-05** (see the double-elim-parity remediation entry above), superseding this
disclosure — the format card now describes the reset behavior instead.

### Stale data / cleanup notes

- **Legacy `team_*_id` / `work_team_id` columns** on `bracket_matches` /
  `bracket_seeds` are kept nullable but "no longer written" post the 2026-12-04
  entry-id cutover
  ([match.ts#L8-L17](../../packages/domain/src/brackets/match.ts#L8-L17),
  [supabase-bracket-repository.ts#L370-L406](../../packages/infrastructure/src/supabase-bracket-repository.ts#L370-L406)).
  Candidate drop migration once the back-compat window closes.
- **Prior P1s landed in-tree:** TT-7 scope-XOR fix
  (`20260912000000_fix_save_bracket_standalone_scope_xor.sql`, committed
  `03ab610f`) and TT-8 double-elim loser advancement (`bracket.ts`
  `applyAdvancement` / `unwireAdvancement`, committed `ac43501f`). Verify both on
  the next deploy and close TT-7/TT-8.

---

## Division bracket page — UX/UI deep-dive (2026-06-10)

Scope: the host/captain workspace at `/events/[id]/bracket?division=…`
([page.tsx](../../apps/web/src/app/events/[id]/bracket/page.tsx)) and the shared
`_components` it renders, plus the spectator twin
([watch/page.tsx](../../apps/web/src/app/events/[id]/bracket/watch/page.tsx)).
Lens: bugs, gaps, streamlining, accessibility, and M3/stale-code drift — the
UX/UI layer on top of the closed TT-\* correctness backlog. **4 P2 · 10 P3.**

### UX-1 — Host sees spectator "check back" copy before controls resolve · **P2** · ✅ FIXED 2026-06-10

The page is cacheable + viewer-independent, so
[`useEventManageCaps`](../../apps/web/src/app/events/[id]/_components/use-event-manage-caps.ts)
starts at `{ canManage: false }` and resolves the host **after** hydration.
During that window the host sees the **spectator** message —
[no-bracket-view.tsx#L12-L18](../../apps/web/src/app/events/[id]/bracket/_components/no-bracket-view.tsx#L12-L18)
("The host hasn't created a bracket… yet"),
[setup-view.tsx#L25-L31](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx#L25-L31),
[bracket-workspace.tsx#L113-L117](../../apps/web/src/app/events/[id]/bracket/_components/bracket-workspace.tsx#L113-L117)
— then it flips to their controls. A host being told "the host hasn't done this"
is confusing. The hook had no way to distinguish "resolved as spectator" from
"still resolving."
**Fix:** add `resolved: boolean` to the hook's return; render a neutral skeleton
for the host-conditional text views until `resolved`, so spectator copy only
ever shows to confirmed spectators.

### UX-2 — "Discard" in setup is a near-no-op with a misleading label · **P2** · ✅ FIXED 2026-06-10

[setup-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx)
labelled the secondary action **Discard**, but it called `reset`, and
[`Bracket.reset()`](../../packages/domain/src/brackets/bracket.ts#L606-L613) only
clears `_matches` and sets status→`setup`. In `setup` there are no matches yet
**and seeds are not cleared**, so "Discard" did nothing visible except flash
"Bracket reset to setup." There is no event-bracket delete, so the word promised
something that can't happen here.
**Fix shipped:** dropped the button in `setup` (the meaningful `reset` cases keep
their own affordances — the draft "Discard" and the live board's "Reset
bracket"). Surfaced the real adjacent gap as **UX-15**.

### UX-15 — No way to change format or delete an event bracket after create · **P2 (uncovered via UX-2)**

While fixing UX-2 it became clear that once an event bracket exists (status
`setup`), there is **no path to change its format or remove it**: `reset` keeps
`format` and `status='setup'`, the format picker lives only in `NoBracketView`
(rendered only when **no** bracket exists), and there is no event-bracket delete
(standalone brackets got one in TT-12; event brackets did not). The old "Discard"
button gave a false impression of this. The
[NoBracketView copy](../../apps/web/src/app/events/[id]/bracket/_components/no-bracket-view.tsx#L24-L26)
("change the format by resetting") is itself inaccurate for the same reason.
**Fix:** add an owner-gated `DeleteBracketCommand` for event scope (mirror
`DeleteStandaloneBracketCommand`) **or** allow `reset` to also accept a new
format / return to a no-bracket state, and correct the NoBracketView copy.
Bigger than a label tweak — tracked as its own P2.

### UX-3 — Score-entry inputs have no accessible label · **P2 (a11y)** · ✅ FIXED 2026-06-10

[match-card.tsx#L160-L173](../../apps/web/src/app/events/[id]/bracket/_components/match-card.tsx#L160-L173)
— the set inputs are `name="set_a_1"` etc. with only a sibling
`<span>Set 1</span>` (not a `<label htmlFor>`). Screen-reader users hear
unlabeled number spinners.
**Fix:** add `aria-label={`Team A, set ${i + 1}`}` / `Team B…` to each input.

### UX-4 — Custom radio cards have no visible keyboard focus · **P2 (a11y, WCAG 2.4.7)** · ✅ FIXED 2026-06-10

The format cards, "Best of" pills, and pool-schedule pills hide the real radio
with `sr-only` and style the wrapping `<label>` only for `selected`/`hover` — no
focus state
([format-picker-form.tsx#L540-L558](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx#L540-L558),
[#L604-L620](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx#L604-L620),
[#L700-L718](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx#L700-L718)).
A keyboard user arrowing through formats sees nothing move.
**Fix:** add `has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary` to
each label.

### UX-5 — "Reset bracket" still hand-rolls `bg-red-600` · **P3** · ✅ FIXED 2026-06-10

[board-view.tsx#L262](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx#L262)
uses `bg-red-600 … hover:bg-red-700` — the 2026-06-07 danger-zone migration moved
the four delete/cancel panels to `errorButtonClass` but missed this one. The
enclosing `<details>` already uses `border-md-error` tokens, so the raw-red
button is internally inconsistent (AGENTS pattern 11).
**Fix:** `import { errorButtonClass }` and apply `errorButtonClass('sm')`.

### UX-6 — Status notice hand-rolls the alert surface instead of `<Alert>` · **P3** · ✅ FIXED 2026-06-10

[page.tsx#L175-L187](../../apps/web/src/app/events/[id]/bracket/page.tsx#L175-L187)
hand-builds `border-md-success/30 bg-md-success/10 text-md-success`. AGENTS
pattern 17 routes status surfaces through
[`<Alert variant>`](../../apps/web/src/components/alert.tsx).
**Fix:** `<Alert variant={notice.tone}>…</Alert>`.

### UX-7 — h1 is undersized for a page title · **P3** · ✅ FIXED 2026-06-10

Both [page.tsx#L124](../../apps/web/src/app/events/[id]/bracket/page.tsx#L124) and
the watch twin use `text-headline-sm` (24/32 — the h2/h3 size); AGENTS pattern 16
maps a **page-title h1** to `text-headline-lg` (32/40).
**Fix:** `text-headline-lg` on both h1s.

### UX-8 — Completed/winner highlight uses raw `green-500` · **P3 (judgment)**

[match-card.tsx#L83](../../apps/web/src/app/events/[id]/bracket/_components/match-card.tsx#L83)

- [#L206](../../apps/web/src/app/events/[id]/bracket/_components/match-card.tsx#L206)
  and the save button at
  [#L179](../../apps/web/src/app/events/[id]/bracket/_components/match-card.tsx#L179)
  (`bg-primary text-primary-fg`, hand-rolled) are the only raw-palette holdouts in
  the bracket tree. A completed match / winner reads as success-semantic.
  **Fix:** `bg-md-success/10` etc. and `primaryButtonClass` for the save button —
  unless treated as decorative (borderline).

### UX-9 — Division tabs show no per-division state · **P2** · ✅ FIXED 2026-06-10

[page.tsx#L153-L173](../../apps/web/src/app/events/[id]/bracket/page.tsx#L153-L173)
renders tabs labeled by division name only. A host running a multi-division
tournament can't tell which divisions have a bracket _created / live / final_ —
they must click each tab to find out. Highest-value running-the-event
improvement.
**Fix:** a lightweight per-division bracket-status lookup
(`listDivisionStatuses(divisionIds)` — one `event_brackets` query) feeding a
status pill on each tab. Extract the duplicated nav (cleanup below) into a shared
`DivisionTabs` so both surfaces get it.

### UX-10 — No status badge on the host page (watch page has one) · **P3**

The spectator page shows a LIVE/Final pill
([watch/page.tsx#L178-L187](../../apps/web/src/app/events/[id]/bracket/watch/page.tsx#L178-L187));
the host workspace shows nothing but BoardView's "In progress / Final results"
subtext, and nothing in setup/draft. Parity gap.
**Fix:** lift the same badge into the host header.

### UX-11 — A completed bracket never celebrates the champion · **P3**

On completion the winner is only the green-tinted team in the final card — no
"🏆 Champion: Team X" banner on either surface.
**Fix:** when `status === 'completed'`, render a champion banner above the board
from the final match's `winnerEntryId`.

### UX-12 — "Not a tournament" / "No divisions configured" are bare dead-ends · **P3**

[page.tsx#L45-L65](../../apps/web/src/app/events/[id]/bracket/page.tsx#L45-L65) —
both states are gray text with only "← Back to event," no path to fix (a host on
"no divisions configured yet" has no link to add one).
**Fix:** add a host CTA to the event's edit/divisions screen; keep plain copy for
spectators.

### UX-13 — Long actions give no progress feedback · **P3**

[SubmitButton](../../apps/web/src/components/submit-button.tsx) disables on submit
but only swaps text if passed `pendingChildren`, which no bracket form does —
Generate / Publish / Record-result just fade slightly.
**Fix:** pass `pendingChildren` ("Generating…", "Publishing…") on the heavy
actions.

### UX-14 — TreeBracket connectors drift on expanded cards & double-elim losers · **P3**

Acknowledged in the component's own docstring
([tree-bracket.tsx#L29-L37](../../apps/web/src/app/events/[id]/bracket/_components/tree-bracket.tsx#L29-L37))
— the 25%/75% inset assumes equal card heights, so an expanded "Enter result"
card pulls its connector off-center. Known polish item; tracked.

### Cleanup notes (UX deep-dive)

- **`pickLatestMatchId` computed twice** in
  [bracket-workspace.tsx#L122](../../apps/web/src/app/events/[id]/bracket/_components/bracket-workspace.tsx#L122)
  & [#L143](../../apps/web/src/app/events/[id]/bracket/_components/bracket-workspace.tsx#L143)
  — hoist to one `const`.
- **Header + division-nav markup duplicated** between
  [page.tsx](../../apps/web/src/app/events/[id]/bracket/page.tsx) and
  [watch/page.tsx](../../apps/web/src/app/events/[id]/bracket/watch/page.tsx) —
  addressed by the shared `DivisionTabs` in the UX-9 fix.

---

## Remediation log

### 2026-06-10 — Division-bracket-page UX bundle 2 (UX-2, UX-5, UX-6, UX-7)

Quick correctness + M3/token cleanups off the UX deep-dive. Verify chain green
(typecheck / lint / test / build).

- **UX-2 — drop the no-op "Discard".** Removed the misleading secondary button
  from the `setup` action card in
  [setup-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx)
  — in `setup` it called `reset`, which clears only matches (none exist yet) and
  keeps seeds, so it just flashed "reset to setup." Generate is now the sole
  action there; the meaningful `reset` cases keep their own controls (draft
  "Discard", live "Reset bracket"). **Uncovered UX-15** (no format-change /
  delete for an event bracket after create) — filed, not fixed here.
- **UX-5 — `errorButtonClass`.** The live board's "Reset and re-seed" confirm
  ([board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx))
  swapped its hand-rolled `bg-red-600 … hover:bg-red-700 text-white` for
  `errorButtonClass('sm')` (M3 `error` role, theme-correct in dark mode) — closes
  the AGENTS-pattern-11 holdout flagged in the deep-dive.
- **UX-6 — notice → `<Alert>`.** The flash-param status banner in
  [page.tsx](../../apps/web/src/app/events/[id]/bracket/page.tsx) now renders
  `<Alert variant={notice.tone}>` (AGENTS pattern 17) instead of hand-rolled
  `border-md-success/30 bg-md-success/10 …` — gains the icon + auto `role`
  (status/alert) for free.
- **UX-7 — h1 → `headline-lg`.** The page-title h1 on both
  [page.tsx](../../apps/web/src/app/events/[id]/bracket/page.tsx) and
  [watch/page.tsx](../../apps/web/src/app/events/[id]/bracket/watch/page.tsx)
  moved `text-headline-sm` → `text-headline-lg` (AGENTS pattern 16 page-title
  size).

Remaining: **UX-15** (P2) + **UX-8, UX-10…14** (P3).

### 2026-06-10 — Division-bracket-page UX bundle 1 (UX-1, UX-3, UX-4, UX-9)

First bundle off the 2026-06-10 UX/UI deep-dive. Verify chain green (typecheck /
lint / test / build).

- **UX-1 — host spectator-copy flash.**
  [`useEventManageCaps`](../../apps/web/src/app/events/[id]/_components/use-event-manage-caps.ts)
  now returns `resolved: boolean` (false until the post-hydration
  `auth.getUser()` round-trip lands). The three host-conditional text views —
  [no-bracket-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/no-bracket-view.tsx),
  [setup-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx),
  and the draft branch in
  [bracket-workspace.tsx](../../apps/web/src/app/events/[id]/bracket/_components/bracket-workspace.tsx)
  — render a neutral
  [`BracketViewSkeleton`](../../apps/web/src/app/events/[id]/bracket/_components/bracket-view-skeleton.tsx)
  while `!resolved`, so the spectator "check back" copy only shows to confirmed
  spectators. The board states (active/completed) render immediately for both as
  before. Existing `useEventManageCaps` consumers are unaffected (additive field).
- **UX-3 — score-input labels.** Each `set_a_*` / `set_b_*` number input in
  [match-card.tsx](../../apps/web/src/app/events/[id]/bracket/_components/match-card.tsx)
  gained an `aria-label` ("`<TeamName>`, set N").
- **UX-4 — keyboard focus on radio cards.** The format cards, "Best of" pills,
  and pool-schedule pills in
  [format-picker-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx)
  gained `has-focus-visible:ring-2 has-focus-visible:ring-primary` so the
  `sr-only` radio's focus is visible on its label.
- **UX-9 — per-division tab status.** New `listDivisionStatuses(divisionIds)`
  port ([bracket-repository.ts](../../packages/domain/src/brackets/bracket-repository.ts))
  - admin-client adapter
    ([supabase-bracket-repository.ts](../../packages/infrastructure/src/supabase-bracket-repository.ts))
    — one `event_brackets` read. New shared
    [`DivisionTabs`](../../apps/web/src/app/events/[id]/bracket/_components/division-tabs.tsx)
    (server component; takes `basePath` + a `statusByDivision` map) renders a
    status pill per tab (Setup / Draft / ● Live / ✓ Final, mirroring the watch
    header treatment) and replaces the duplicated nav markup on **both**
    [page.tsx](../../apps/web/src/app/events/[id]/bracket/page.tsx) and
    [watch/page.tsx](../../apps/web/src/app/events/[id]/bracket/watch/page.tsx)
    (closes the duplicated-nav cleanup note).

Remaining UX backlog: **UX-2** (P2 "Discard" label), **UX-5…8**, **UX-10…14**
(P3).

### 2026-06-05 — Bracket polish bundle (deferred follow-ups)

Cleared the small bracket follow-ups noted across the prior entries. Verify chain
green (typecheck / lint / unit tests — domain 512 — / build). Narrative:
[journal 2026-06-05](../journal/2026-06-05-bundle-bracket-polish.md).

- **Add-a-game on the live board.** The domain allowed `addMatch` while `active`
  but the UI only exposed it in the draft workspace. Extracted the shared
  [`AddMatchButton`](../../apps/web/src/app/events/[id]/bracket/_components/add-match-button.tsx)
  and surfaced "+ Add game" per pool (pool play) and once (round robin) on the
  active board for the host
  ([board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx)).
- **Playoff re-seed UI (wired a dead handler).** `SeedPlayoffHandler` existed but
  was unreachable — no action, no UI, no standalone twin. Added the event action,
  a standalone `SeedStandalonePlayoff` command/handler, the binding, and a
  [`ReseedPlayoffButton`](../../apps/web/src/app/events/[id]/bracket/_components/reseed-playoff-button.tsx)
  (drag-reorder via the existing `SeedingList`) shown before any playoff match
  starts. The current cross-seed order is recomputed (`rankAcrossPools`) to
  pre-fill the picker. 2 domain tests added for `Bracket.seedPlayoff`.
- **Spectator focus.** `pickLatestMatchId` now prefers a pending _deciding_ final
  (the double-elim reset, or a championship awaiting both semifinalists) over the
  last completed final.
- **List delete.** A 2-step "Delete bracket" disclosure on each `/brackets` row
  ([brackets/page.tsx](../../apps/web/src/app/brackets/page.tsx)) — the detail-page
  delete (TT-12) is no longer the only path.
- **Stale-data note resolved.** The legacy `team_*_id` / `work_team_id` columns were
  already dropped in
  [20260813000000](../../supabase/migrations/20260813000000_drop_legacy_team_id_columns.sql);
  the "drop candidate" follow-up was itself stale. Fixed the lingering "kept
  nullable" comments in
  [match.ts](../../packages/domain/src/brackets/match.ts) — no migration needed.

### 2026-06-05 — Double-elim parity: non-power-of-two byes + reset grand final (roadmap items; supersedes the TT-9 pow2 guard + TT-17 disclosure)

Implemented the two genuine generator limitations that TT-9 and TT-17 had been
papering over. Verify chain green (typecheck / lint / unit tests — domain 510 — /
build). Narrative:
[journal 2026-06-05](../journal/2026-06-05-bundle-double-elim-byes-reset-final.md).

- **Non-power-of-two double elim.** `generateDoubleElimination` now builds for any
  field of 4+: it lays out the `P = nextPow2(N)` skeleton, gives the top seeds
  winners-round-1 byes, then a structural "will this slot ever hold a real team?"
  propagation prunes the losers-bracket matches a bye starves and re-routes the
  live feeders past them (`resolveLosersBracketByes` in
  [generators.ts](../../packages/domain/src/brackets/generators.ts)). 5/6/7-team
  fields now play cleanly through to a champion (domain tests).
  **This supersedes TT-9's power-of-two precondition** — `validateTeamCountForFormat`
  dropped the DE pow2 check (the floor of 4 stays); the format picker no longer
  shows a pow2 shape gate.
- **Reset grand final (true double elim).** The generator emits a second `final`
  match (the reset) wired off the grand final; the aggregate activates it only
  when the **losers-bracket** team wins the grand final (both then have one loss),
  and voids it as a bye when the winners-bracket team wins
  (`grandFinalResetFor` / `applyAdvancement` / `unwireAdvancement` in
  [bracket.ts](../../packages/domain/src/brackets/bracket.ts)). The board renders
  the reset only once it's populated
  ([board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx)).
  **This supersedes TT-17** — the "single grand final (no bracket reset)"
  disclosure was removed from the format card.
- Backward compatible: a power-of-two field generates no byes (no pruning), and a
  WB-team grand-final win voids the reset, so existing 4-/8-team behavior is
  unchanged apart from the (conditional) reset match. 6 domain tests added
  (byes playthrough for 5/6/7 teams; reset forced vs. voided; reset revert).

### 2026-06-05 — TT-16 + TT-17: pool-play feasibility + DE grand-final disclosure (both P3)

Closes the bracket-audit P3 backlog. Verify chain green (typecheck / lint / unit
tests — domain 504, application 135 — / build). Narrative:
[journal 2026-06-05](../journal/2026-06-05-bundle-tt16-tt17-pool-feasibility-de-disclosure.md).

- **TT-16 — per-pool advance feasibility.** The real bug was a **hand-assigned
  uneven pool** (via `setPools`) leaving one pool with fewer than `advancePerPool`
  teams even when the global count passed — surfacing late at `generatePlayoff`
  as a cryptic "missing position N". Now caught at generate / Edit-pools time:
  `generatePoolPlay` takes a `minAdvancePerPool` and throws a **pool-named**
  `ValidationError`
  ([generators.ts](../../packages/domain/src/brackets/generators.ts)), wired from
  `Bracket.generate()`; `generatePlayoff` keeps a defense-in-depth pool-named
  guard ([bracket.ts](../../packages/domain/src/brackets/bracket.ts)). The create
  gate now factors the config in — `validateTeamCountForFormat` takes optional
  `{ poolCount, advancePerPool }` and the create handler passes them, so an
  under-configured pool field fails at **create**, not generate
  ([enums.ts](../../packages/domain/src/brackets/enums.ts),
  [bracket.handler.ts](../../packages/application/src/commands/bracket.handler.ts)).
  4 domain + 1 handler test added.
- **TT-17 — DE grand-final disclosure.** The v1 single grand final (no bracket
  reset) is now disclosed on the double-elimination format card
  ([format-picker-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx)):
  "Grand final is a single game (no bracket reset)." The reset itself stays a
  roadmap item (a genuine generator change).

### 2026-06-05 — TT-11: standalone draft + manual-edit parity (P2 fixed; closes TT-13/14/15)

Standalone brackets now have the **full** ADR-0032 division-path flow:
`generate → draft (review/edit) → Publish → active (live edits) → completed
→ Re-open`. The standalone create flow changed from one-click-live to
draft→publish (user-confirmed). Verify chain green (typecheck / lint / unit
tests — standalone handler suite 15 → 22 — / build). Full narrative:
[journal 2026-06-05](../journal/2026-06-05-bundle-tt11-standalone-draft-edit-parity.md).

- **No auto-publish.** `GenerateStandaloneBracketHandler` dropped the
  `bracket.publish()` bridge, so generate lands in `draft`
  ([standalone-bracket.handler.ts](../../packages/application/src/commands/standalone-bracket.handler.ts)).
- **6 owner-gated manual-edit handlers** (publish / setPools / editMatch /
  addMatch / removeMatch / replaceEntry), mirroring the event host-gated suite
  via `loadOwnedBracket` and reusing the shared `buildMatchPatch` /
  `buildAddMatchInput` (now exported from
  [bracket.handler.ts](../../packages/application/src/commands/bracket.handler.ts)),
  wired in the composition root.
- **6 standalone server actions** in
  [brackets/actions.ts](../../apps/web/src/app/brackets/actions.ts), mirroring the
  event `*FromForm` actions field-for-field.
- **Scope-driven UI.** `BoundBracketActions` gained
  publish/setPoolsFromForm/addMatchFromForm/editMatchFromForm/removeMatch/
  replaceEntryFromForm for both scopes
  ([bracket-action-binding.ts](../../apps/web/src/app/events/[id]/bracket/_components/bracket-action-binding.ts)).
  `MatchEditor` + `DraftWorkspace` were parameterized on `BracketScope`
  ([match-editor.tsx](../../apps/web/src/app/events/[id]/bracket/_components/match-editor.tsx),
  [draft-workspace.tsx](../../apps/web/src/app/events/[id]/bracket/_components/draft-workspace.tsx)),
  and the board's structural-edit gate dropped its `scope.kind === 'event'`
  check — `LiveHostTools` / Substitute / per-match Edit now serve both scopes
  ([board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx)).
- **Standalone pages.** `/brackets/[id]` renders the `DraftWorkspace` on `draft`
  and passes `teams` + `targetScore` to the board
  ([page.tsx](../../apps/web/src/app/brackets/[id]/page.tsx)); the watch page
  handles `draft` and gates the LIVE/Final badge
  ([watch/page.tsx](../../apps/web/src/app/brackets/[id]/watch/page.tsx)); the
  list labels `draft` ([brackets/page.tsx](../../apps/web/src/app/brackets/page.tsx)).
  These rider fixes close **TT-13** (badge), **TT-14** (`targetScore`), **TT-15**
  (`draft` label).
- **E2E + tests.** The standalone e2e helper now clicks Publish after generate
  ([standalone-bracket.ts](../../apps/web/tests/e2e/_helpers/standalone-bracket.ts));
  7 application cases added
  ([standalone-bracket.handler.test.ts](../../packages/application/src/commands/standalone-bracket.handler.test.ts))
  including the generate-lands-in-draft behavior change.

Remaining bracket-audit backlog: **TT-16** (per-pool advance feasibility) and
**TT-17** (DE grand-final reset) — both P3.

### 2026-06-05 — TT-10 + TT-12: standalone reopen + delete (both P2 fixed)

Closed the two standalone dead-ends. Verify chain green (typecheck / lint / unit
tests / build; standalone handler suite 10 → 15). Full narrative:
[journal 2026-06-05](../journal/2026-06-05-bundle-tt10-tt12-standalone-reopen-delete.md).

- **TT-10 — standalone reopen.** New owner-gated `ReopenStandaloneBracketCommand` /
  `ReopenStandaloneBracketHandler`
  ([standalone-bracket.handler.ts](../../packages/application/src/commands/standalone-bracket.handler.ts))
  - `reopenStandaloneBracket` action
    ([brackets/actions.ts](../../apps/web/src/app/brackets/actions.ts)). The board's
    completed-state "Re-open to edit" strip was extracted to a shared `ReopenStrip`
    and is now rendered for `scope.kind === 'standalone'` too — driven by a new
    `reopen` entry on `BoundBracketActions`
    ([bracket-action-binding.ts](../../apps/web/src/app/events/[id]/bracket/_components/bracket-action-binding.ts),
    [board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx)).
    The event-only Substitute / per-match Edit stay event-scoped (that's TT-11).
- **TT-12 — standalone delete.** New `deleteBracket` repository port
  ([bracket-repository.ts](../../packages/domain/src/brackets/bracket-repository.ts),
  [supabase-bracket-repository.ts](../../packages/infrastructure/src/supabase-bracket-repository.ts)
  — a single `DELETE FROM event_brackets`; seeds / matches → sets / teams /
  `match_live_scores` all FK-cascade), owner-gated
  `DeleteStandaloneBracketCommand` / handler, and a `deleteStandaloneBracket`
  action that redirects to `/brackets`. A two-step "Delete this bracket" danger
  zone was added to the standalone workspace
  ([brackets/[id]/page.tsx](../../apps/web/src/app/brackets/[id]/page.tsx)). The
  cap copy's "Finish or delete your current bracket" is now accurate, and a free
  owner stuck on a non-generatable bracket (TT-9 scenario) can free the slot.
- **Tests.** 5 application cases added
  ([standalone-bracket.handler.test.ts](../../packages/application/src/commands/standalone-bracket.handler.test.ts)):
  reopen completed→active + non-owner reject; delete owned + non-owner reject +
  unknown-bracket NotFound.

Still open: **TT-11** (the broader standalone draft + manual-edit parity —
per-match Edit, Substitute, add/remove match, Edit pools, playoff re-seed). TT-10
unblocks the sharpest data-integrity case; TT-11 remains the larger build.

### 2026-06-05 — TT-9: double-elimination team-count precondition (P1 fixed)

The create/seed/generate stack now enforces the **full** double-elimination
precondition (≥ 4 **and** a power of two) up-front, instead of letting it fail
late inside the generator. One shared domain rule, surfaced at all three gates.
Verify chain green (typecheck / lint / 657 unit tests / build).

- **Domain — single source of truth.** `minTeamsForFormat('double_elimination')`
  bumped 3 → **4**, and a new
  [`validateTeamCountForFormat(format, teamCount)`](../../packages/domain/src/brackets/enums.ts)
  returns `{ ok } | { ok: false; reason }` — the min floor plus the power-of-two
  shape rule, with an actionable message ("you have 6 — drop to 4 or add 2 to reach
  8"). Pinned by [enums.test.ts](../../packages/domain/src/brackets/enums.test.ts).
- **Create handler.** `CreateBracketHandler` now validates registered teams against
  `validateTeamCountForFormat`, not a bare count
  ([bracket.handler.ts](../../packages/application/src/commands/bracket.handler.ts)).
  Two cases added to
  [bracket.handler.test.ts](../../packages/application/src/commands/bracket.handler.test.ts)
  (rejects a 6-team DE before `save`; accepts an 8-team DE).
- **Format picker.** Synced DE `minTeams` to 4 and added a shape-check that disables
  Create + shows the reason when the registered field isn't a power of two
  ([format-picker-form.tsx](../../apps/web/src/app/events/[id]/bracket/_components/format-picker-form.tsx)).
  Standalone create (no teams yet) is unaffected — it enforces at the Generate gate.
- **Setup Generate gate.** `SetupView` now gates Generate on
  `validateTeamCountForFormat` and renders the reason — the common chokepoint that
  also covers the **standalone** surface, whose create path doesn't enforce a count
  ([setup-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx)).

~~Not yet addressed (roadmap): true non-power-of-two double-elim support (byes in
WB R1)~~ — **✅ implemented 2026-06-05** (see the double-elim-parity remediation
entry above); the TT-9 power-of-two precondition this fix added was superseded by
that work. The floor of 4 remains.

### 2026-06-02 — bracket workflow redesign (ADR 0032, cross-reference)

The host bracket surface in this audit's scope (`/events/[id]/bracket`) was rebuilt
under [ADR 0032](../adr/0032-bracket-workflow-redesign.md): a `draft → live`
lifecycle, manual override of seeding / pools / schedule / matchups / results,
uneven pools with target-games (repeats), per-stage + per-match length, and
auto cross-seeded playoffs. This sits adjacent to the tools↔event tie-back work
below (it changes the canonical bracket surface the standalone seeding/scheduler
tools feed into — TT-4/TT-5). Full narrative across the five bundles:
[domain](../journal/2026-06-02-bundle-bracket-workflow-redesign-domain.md),
[commands](../journal/2026-06-02-bundle-bracket-workflow-redesign-commands.md),
[create-ui](../journal/2026-06-02-bundle-bracket-workflow-redesign-create-ui.md),
[draft-workspace](../journal/2026-06-02-bundle-bracket-workflow-redesign-draft-workspace.md),
[live-board](../journal/2026-06-02-bundle-bracket-workflow-redesign-live-board.md),
[polish/e2e](../journal/2026-06-02-bundle-bracket-workflow-redesign-polish-e2e.md).
Static quad green; **e2e authored to the new flow but not yet run against dev**
(deploy-gated).

### 2026-06-02 — quick links + event tie-back (TT-1/TT-2 shipped; TT-3/4/5 addressed)

Bundle narrative: [journal 2026-06-02](../journal/2026-06-02-tools-event-tie-back.md).
Verify chain green (typecheck / lint / 214 web tests / build).

- **TT-1 — fixed.** Host-tools quick-links card added to the manage dashboard's
  "Run the event" group ([manage-dashboard.tsx](../../apps/web/src/app/events/[id]/manage/_components/manage-dashboard.tsx))
  and a host-gated tools row inside
  [bracket-workspace.tsx](../../apps/web/src/app/events/[id]/bracket/_components/bracket-workspace.tsx)
  (bound to the active division; rendered only after `canManage` resolves, so no
  spectator leak). New [event-tools-card.tsx](../../apps/web/src/app/tools/_components/event-tools-card.tsx).
- **TT-2 — fixed (randomizer + seeding write paths; scheduler/standings handoffs).**
  New `EventToolBinding` ([event-binding.ts](../../apps/web/src/app/tools/_lib/event-binding.ts))
  - server context loader ([load-event-tool-context.ts](../../apps/web/src/app/tools/_lib/load-event-tool-context.ts),
    gated on `event.canManage`). Bound tools pull roster/teams and save back via the
    unchanged commands: randomizer → `RegisterAdHocTeamCommand`
    ([event-actions.ts](../../apps/web/src/app/tools/team-randomizer/event-actions.ts)),
    seeding → `SeedBracketCommand`
    ([event-actions.ts](../../apps/web/src/app/tools/seeding/event-actions.ts)).
- **TT-3 — fixed.** Bound tools render the "Connected to your event" banner
  ([event-binding-banner.tsx](../../apps/web/src/app/tools/_components/event-binding-banner.tsx))
  with save + "Back to event".
- **TT-4 — addressed (positioning).** Standings stays a **feeder**: the bound
  room pre-seeds the division's teams and the banner points to the canonical
  Division podium panel (`recordDivisionPlacement`) to record placements — no
  fragile name→`entry_id` write from the shared room. Seeding likewise feeds the
  bracket rather than competing with its seeding-list.
- **TT-5 — addressed (honest deep-link).** Scheduler is pull + a "set up pool
  play on the bracket" note; no fake "save schedule" write (the domain has none).
- **Open-redirect guard** hardened in `parseEventBinding` (`//host` rejected),
  pinned by [event-binding.test.ts](../../apps/web/src/app/tools/_lib/event-binding.test.ts).

Deferred (see journal Follow-ups): timer/rotation tie-back; a direct
"record podium from the standings room"; a division switcher on bound tool pages.

---

## How to re-run this audit

1. Walk a host through running a real tournament: create event → divisions →
   seed → schedule → score → podium. Note every point they'd reach for a tool
   and whether it's one click away **and** lands back on the event.
2. Re-check the root-cause table: does each standalone tool have an event-bound
   "Save to event" path, or is it still a copy-paste dead-end?
3. Update the remediation log + flip the README index row date.
