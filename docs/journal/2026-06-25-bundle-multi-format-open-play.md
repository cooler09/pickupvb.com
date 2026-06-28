# Open-play advisory tags — formats + skill tiers (2026-06-25)

## Context

User feedback: hosts want to specify **multiple formats** (sixes / quads /
triples / doubles) at one open-play session — e.g. some courts running 4s and
some 6s, or 6s early then 2s late. Open play carried a **single** format (on its
sole division) with no way to say "we run more than one." A follow-up request
asked for the **same strategy** applied to **skill tiers** ("B / BB / A all
welcome") — shipped in the same bundle as a sibling advisory `skill_tiers` tag.

We evaluated three strategies (multi-agent workflow, 3 designs × 4 adversarial
lenses) before building:

- **A — reuse divisions** (relax the single-division invariant, one solo division
  per format, RSVP-into-a-format, per-format capacity).
- **B — advisory `formats[]` tag** (event-level array; cards/detail/search show
  and match every format; one shared RSVP pool).
- **C — hybrid** (B now, promotable to A later).

The host confirmed the need is to **advertise** multiple formats, not to
partition capacity/pricing. Both canonical real-world cases (rotating mixed
courts; format-by-time) are _worse_ served by a hard per-format cap than by one
RSVP + an honest "we run 4s and 6s" label. So we shipped **B**.

## Decisions

- **Chose B (advisory tag) over A (per-format divisions) because** the feedback
  is advertising, not partitioning. A forces a commit-to-one-format RSVP onto
  drop-in social play, removes the waitlist per format, and drags a rewrite
  through the shared `enforce_event_capacity` trigger and the `save_event` RPC's
  sole-division attendee path (silent RSVP data-loss if half-shipped). B touches
  none of those.
- **Rejected C's hybrid framing because** its one-way `promoteToPerFormatDivisions`
  bridge + XOR invariant is _more_ work than building A outright. If we ever need
  per-format capacity, build A directly on top of B (`formats` becomes derived);
  don't pre-build a bridge we may never cross.
- **The single-division invariant stays in force.** `formats` is event-level
  advisory metadata — it does **not** create divisions. `assertRegistrationConfigValid`
  (`packages/domain/src/events/volleyball-event.ts`) is untouched; this is **not**
  an ADR (it overturns no prior decision) — a journal entry suffices.
- **Stored only when 2+ formats** (`CreateEventHandler`): a single format is
  already covered by the division, so single-format open plays keep `formats =
'{}'` and behave exactly as before. The **first** selected format (in display
  order) drives the sole division; the full set is the advisory tag.
- **Bonus fix:** open play had _no_ format selector at all (it defaulted to
  sixes). The new multiselect lets a host pick a single non-sixes format too.
- **`save_event` redefined (not a side `.update()`)** to persist `formats`,
  keeping the one-atomic-RPC save invariant (architecture audit P2-2). Faithful
  copy of `20261012000000` + `formats` threaded through the upsert — exactly as
  that migration copied `20260919000000`.
- **`search_events` filter only, no projection.** The Format filter now also
  matches `events.formats` (so a 4s search finds a 6s+4s open play). We did
  **not** add `formats` as an RPC output column / card chip — cards don't render
  format for single-division open play today, so adding it would introduce a
  Following-feed inconsistency for no real gain. Kept the RPC a no-signature-change
  `create or replace`.
- **Skill tiers — same advisory strategy, with two deliberate asymmetries.**
  (1) **No surface constraint** — any tier is valid on any surface, so
  `normalizeSkillTiers` only dedupes + caps (7), with no `assertFormatAllowedForSurface`
  analogue and no CHECK. (2) **Kept the existing required `skillTier` select**
  (formats had no selector to begin with) and added an "Also open to other
  levels" multiselect; the advertised set = primary ∪ extras, stored when ≥2.
  The primary still drives the division's skill via the existing
  `skillLevel`-band path (precise tier collapses to b/bb/a/open as before — the
  advisory array preserves the precise tiers for display/search). Search matches
  an advertised tier through the **skill-band** branch (the events page filters
  by band), gated to "no age/team-comp filter" since advisory tags carry neither.

## Changes

Domain / application / infra:

- `packages/domain/src/events/volleyball-event.ts` — `_formats`/`_skillTiers`
  fields + getters + `normalizeFormats` (dedupe, surface-legal via
  `assertFormatAllowedForSurface`, cap 4) / `normalizeSkillTiers` (dedupe, cap 7,
  no surface rule); threaded through `CreateEventProps`, `create()`,
  `fromPersistence()`.
- `packages/domain/src/events/event-repository.ts` — `formats` + `skillTiers` on
  `EventDetailReadModel`.
- `packages/types/src/events.ts` — `CreateEventSchema.formats` (+ open-play
  surface refine) and `CreateEventSchema.skillTiers` (max 7).
- `packages/application/src/commands/create-event.handler.ts` — derive the
  primary division format from `formats[0]`; store each advisory set only when 2+.
- `packages/infrastructure/src/supabase-event-repository.ts` — `EventRow.formats`
  - `skill_tiers`, read in `findById` + `getDetail`, write in the `save_event`
    payload.
- `packages/supabase/src/database.types.ts` — **hand-edited** `events`
  Row/Insert/Update + `events_view` Row for `formats` + `skill_tiers` (regenerate
  on next `gen:types` against the deployed schema).

Migration `supabase/migrations/20261016000000_open_play_advertised_tags.sql`
(both tags folded into one migration since the formats one hadn't shipped — avoids
a redundant second `events_view`/`save_event` rebuild):

- `events.formats format[]` + `events.skill_tiers skill_tier[]`, both
  `not null default '{}'`; `events_advertised_formats_indoor` CHECK on formats
  (mirrors `event_divisions_indoor_format`; skill tiers carry no surface rule).
- Rebuild `events_view` so `select e.*` surfaces both columns (verbatim from
  `20261012000000`).
- Redefine `save_event` (+ both arrays) and `create or replace search_events`
  (+ `or p_format = any(e.formats::text[])` and a skill-band branch matching any
  advertised `skill_tiers` entry when no age/team-comp filter is set), both from
  their authoritative latest versions.

Web:

- `apps/web/src/app/events/new/_components/open-play-body.tsx` — surface-aware
  format multiselect (controlled surface + format set; disabled/pruned when
  surface-illegal); a controlled `skillTier` primary select (reusing
  `SkillTierOptions`) + an "Also open to other levels" tier multiselect that
  excludes the current primary. `new/actions.ts` reads `format_*` → `dto.formats`
  and `skill_*` (∪ primary) → `dto.skillTiers`.
- `apps/web/src/app/events/[id]/_components/event-meta-section.tsx` + `page.tsx`
  — "Formats" + "Skill levels" rows of chips on the detail page ("one sign-up;
  courts organized on site" / "all welcome"). `new/_components/format-section.tsx`
  comment updated.
- `packages/domain/src/events/volleyball-event.test.ts` — 7 tests (formats +
  skill-tiers: default empty, stores list, dedupe, indoor-rejects-triples).

Docs: `docs/features.md` open-play note.

## Patterns observed

- **`events_view` freezes its `select e.*` column list at create time** — a new
  `events` column needs a view rebuild to reach the read model (the repo reads
  `events_view.select('*')`). Already an AGENTS-known gotcha; reconfirmed.
- **Classic `as $$…$$` SQL functions don't hard-depend on the view**, so
  `drop view events_view; create view …` needs no cascade and `search_events`
  re-resolves it at call time (why `20261012000000` rebuilds the view without
  dropping the RPC).
- **`create or replace function` can't change the RETURN columns** — adding an
  output column to `search_events` would force a drop+recreate (new grant). A
  WHERE-only change is a clean replace; preferring the filter-only change avoided
  that and the Following-feed inconsistency.

## Follow-ups

- **Edit-page formats editor — deferred.** The create path + detail + search
  fully deliver "specify multiple formats at an open play"; editing formats
  post-create needs the edit form to pre-select `formats` ∪ primary-division
  format (a single-format event would otherwise show nothing checked) and to
  update both `events.formats` and the division format via the edit action's
  direct-`.update()` path. Mechanical but non-trivial; `EventDetailReadModel`
  already carries `formats`, so it's a clean add. Build when a host asks.
- **Per-format capacity / pricing (Strategy A) — deferred** until a host
  concretely needs separate caps/prices/rosters per format. Would relax the
  single-division invariant, carry `division_id` on attendees, and fix the
  `save_event` sole-division attendee skip — and would warrant an **ADR 0006
  addendum** (the 2026-05-30 League addendum is the template).
- **Format-by-time** ("6s then 2s") is a distinct, unmodeled feature (per-format
  start/end times) — neither A nor B covers it.
