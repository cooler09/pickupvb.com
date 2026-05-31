-- ============================================================================
-- match_live_scores — in-progress (live) score for a scheduled bracket/league
-- match, plus the two authorization-gated write RPCs. Backs ADR 0023 (live
-- match scoring) Phase 2. Sibling to the canonical finalize RPCs
-- 20260814000100_record_bracket_match_result_rpc.sql /
-- 20260814000000_record_league_match_result_rpc.sql.
-- See docs/adr/0023-live-match-scoring.md.
--
-- Context: a Pro host can score a scheduled match on the scoreboard, and the
-- in-progress score must surface live on the *public* bracket / standings. We
-- deliberately do NOT write per rally point into the canonical
-- `bracket_match_sets` / `league_schedule_matches` rows: the canonical bracket
-- write is a full delete+reinsert replace (`save_bracket`) — pathologically
-- expensive and contended per point, and it would fire winner advancement on
-- every tap. Instead each point upserts one narrow row here; the public view
-- reads it over `postgres_changes` (the same realtime plumbing the bracket page
-- already uses). On completion the live state is folded into the canonical
-- record via the existing finalize RPCs (Phase 3) and this row is cleared.
--
-- Why the public view reads this table rather than the realtime *broadcast*
-- channel: a per-match broadcast channel (name derivable from match_id, which
-- is in the page HTML) is joinable by anyone and spoofable. Gating writes to
-- this table behind the host/captain predicate makes the public live score
-- durable AND non-spoofable.
--
-- Impact: additive. New table `match_live_scores` (public-read RLS, no write
-- policy — writes only via the two SECURITY DEFINER RPCs below), added to the
-- `supabase_realtime` publication with REPLICA IDENTITY FULL so the public
-- subscription can filter UPDATE/DELETE events by `division_id` / `event_id`
-- (non-PK columns). Two new RPCs (`upsert_match_live_score`,
-- `clear_match_live_score`) gated by the SAME predicate the canonical RPCs use
-- (`is_event_host` / `is_event_host_for_division` OR
-- `is_bracket_match_captain` / `is_league_match_captain`). No existing read or
-- write path changes. `event_id` / `division_id` FKs cascade so a deleted
-- division/event drops its live rows; match-level orphan cleanup (e.g. bracket
-- reset) is handled by the Phase 3 clear path.
-- ============================================================================

create table public.match_live_scores (
    -- 1:1 with the scheduled match. Bracket and league match ids are random
    -- UUIDs from different tables but globally unique, so a single PK + a
    -- `kind` discriminator is sufficient (no polymorphic FK on match_id).
    match_id    uuid primary key,
    kind        text not null check (kind in ('bracket', 'league')),
    -- Denormalized parents so the public view can subscribe with one filter
    -- (`division_id=eq.X`) instead of one channel per match. Cascade so a
    -- removed division/event takes its live rows with it.
    event_id    uuid not null references public.events(id) on delete cascade,
    division_id uuid not null references public.event_divisions(id) on delete cascade,
    -- Serialized `LiveMatchScore` value object (packages/domain/src/scoring).
    live_state  jsonb not null,
    -- auth.uid() of the last writer — drives the "someone is scoring" / LIVE
    -- badge and is handy for debugging.
    updated_by  uuid,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index match_live_scores_division_idx on public.match_live_scores (division_id);
create index match_live_scores_event_idx on public.match_live_scores (event_id);

-- Logical replication needs every column available on UPDATE/DELETE for the
-- public subscription's non-PK filters (division_id / event_id) to match. The
-- table is tiny and hot, so FULL replica identity is cheap.
alter table public.match_live_scores replica identity full;

-- ---------- RLS: public read, no write policy ----------
-- Reads are public (the live score is shown on the public bracket/standings).
-- There is intentionally NO insert/update/delete policy: all writes go through
-- the SECURITY DEFINER RPCs below, which carry the explicit host/captain gate.
alter table public.match_live_scores enable row level security;

create policy match_live_scores_select
    on public.match_live_scores for select using (true);

-- Realtime: the public bracket/standings page subscribes to live updates.
alter publication supabase_realtime add table public.match_live_scores;

-- ---------- write RPC: upsert the live score ----------
-- SECURITY DEFINER with an explicit per-match gate (the same shape as
-- record_bracket_match_result). The function resolves the event/division behind
-- the match — branching on kind — requires host-or-captain, then upserts as the
-- owner (a BYPASSRLS role, so the missing write policy doesn't block it). The
-- caller controls only which match they score + the opaque live_state blob;
-- they can never write a match they don't host/captain. `auth.uid()` reads the
-- request JWT even inside a DEFINER body.
create or replace function public.upsert_match_live_score(
    p_match_id   uuid,
    p_kind       text,
    p_live_state jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_event_id    uuid;
    v_division_id uuid;
begin
    if p_kind = 'bracket' then
        select d.event_id, eb.division_id
          into v_event_id, v_division_id
          from public.bracket_matches bm
          join public.event_brackets eb on eb.id = bm.bracket_id
          join public.event_divisions d on d.id = eb.division_id
         where bm.id = p_match_id;

        if v_event_id is null then
            raise exception 'bracket match % not found', p_match_id
                using errcode = 'P0002'; -- no_data_found
        end if;

        if not (
            public.is_event_host(v_event_id)
            or public.is_bracket_match_captain(p_match_id)
        ) then
            raise exception 'not authorized to score this bracket match'
                using errcode = '42501'; -- insufficient_privilege
        end if;

    elsif p_kind = 'league' then
        select m.division_id, d.event_id
          into v_division_id, v_event_id
          from public.league_schedule_matches m
          join public.event_divisions d on d.id = m.division_id
         where m.id = p_match_id;

        if v_division_id is null then
            raise exception 'league schedule match % not found', p_match_id
                using errcode = 'P0002'; -- no_data_found
        end if;

        if not (
            public.is_event_host_for_division(v_division_id)
            or public.is_league_match_captain(p_match_id)
        ) then
            raise exception 'not authorized to score this league match'
                using errcode = '42501'; -- insufficient_privilege
        end if;

    else
        raise exception 'unknown match kind %', p_kind
            using errcode = '22023'; -- invalid_parameter_value
    end if;

    insert into public.match_live_scores
        (match_id, kind, event_id, division_id, live_state, updated_by, updated_at)
    values
        (p_match_id, p_kind, v_event_id, v_division_id, p_live_state, auth.uid(), now())
    on conflict (match_id) do update
        set kind        = excluded.kind,
            event_id    = excluded.event_id,
            division_id = excluded.division_id,
            live_state  = excluded.live_state,
            updated_by  = excluded.updated_by,
            updated_at  = excluded.updated_at;
end;
$$;

-- ---------- write RPC: clear the live score ----------
-- Idempotent: no row → no-op (so the Phase 3 finalize path can call it
-- unconditionally). Gates on the row's stored kind/event_id/division_id, the
-- same host/captain predicate as the upsert.
create or replace function public.clear_match_live_score(
    p_match_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_kind        text;
    v_event_id    uuid;
    v_division_id uuid;
begin
    select kind, event_id, division_id
      into v_kind, v_event_id, v_division_id
      from public.match_live_scores
     where match_id = p_match_id;

    if not found then
        return; -- nothing live for this match
    end if;

    if not (
        (v_kind = 'bracket'
            and (public.is_event_host(v_event_id) or public.is_bracket_match_captain(p_match_id)))
        or (v_kind = 'league'
            and (public.is_event_host_for_division(v_division_id) or public.is_league_match_captain(p_match_id)))
    ) then
        raise exception 'not authorized to clear this match live score'
            using errcode = '42501'; -- insufficient_privilege
    end if;

    delete from public.match_live_scores where match_id = p_match_id;
end;
$$;

grant execute on function public.upsert_match_live_score(uuid, text, jsonb) to authenticated;
grant execute on function public.clear_match_live_score(uuid) to authenticated;
