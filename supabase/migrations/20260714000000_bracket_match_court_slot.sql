-- ============================================================================
-- Bracket matches: court label + parallel-slot scheduling. See
-- docs/adr/0018-pool-play-configuration.md.
--
-- Context: ADR 0018 Phase 3. With multi-court same-day tournaments hosts
-- need each match tagged with (a) which court it plays on and (b) which
-- time slot it shares with other matches running in parallel. Phase 1
-- (bundle 122) shipped match-length / schedule-density knobs; Phase 2
-- (bundle 123) added the work / ref team. This migration adds the two
-- columns the slot solver in `generatePoolPlay` writes to, plus a
-- BracketConfig `courtLabels: string[]` field stored in the existing JSON
-- `config` column on `tournament_brackets` (no schema change there).
--
-- Impact: additive. Both columns are nullable — existing rows and brackets
-- generated without `courtLabels` configured stay valid and read as null.
-- No backfill: the solver only runs at `Bracket.generate()` time, so only
-- newly generated pool-play brackets with a non-empty `courtLabels` will
-- carry non-null values. `court` is free text (chosen from the host-defined
-- label list) — no FK. `slot` is a 1-indexed parallel time-block; matches
-- sharing a slot are intended to run simultaneously on different courts.
-- RLS unchanged.
-- ============================================================================

alter table public.bracket_matches
    add column if not exists court text,
    add column if not exists slot  integer;

create index if not exists bracket_matches_slot_idx
    on public.bracket_matches (bracket_id, slot);
