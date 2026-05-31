-- ============================================================================
-- ADR 0025 + ADR 0023: live scoreboard scoring for standalone brackets.
-- See docs/adr/0025-standalone-brackets.md, docs/adr/0023-live-match-scoring.md
--
-- Context: match_live_scores (20260815000000) denormalizes event_id +
-- division_id (both NOT NULL) so the public bracket/standings view can
-- subscribe with one filter, and the two write RPCs resolve the event/division
-- behind a match to gate "host or captain". A standalone bracket (ADR 0025)
-- has neither an event nor a division, so a standalone match can't carry a live
-- score under the current schema, and the RPCs' INNER join to event_divisions
-- yields no row.
--
-- Impact:
--   * match_live_scores.event_id / division_id become NULLABLE; new bracket_id
--     FK → event_brackets (populated for ALL bracket rows, event and
--     standalone) so the public view can subscribe by bracket_id and the clear
--     RPC can authorize the standalone owner.
--   * upsert_match_live_score: the kind='bracket' branch LEFT-joins
--     event_divisions, captures owner_user_id + bracket id, and admits
--     host/captain (event) OR owner (standalone); the row stores bracket_id.
--   * clear_match_live_score: the bracket branch authorizes host/captain (when
--     event-scoped) OR the bracket owner (standalone) via the stored bracket_id.
--   * League rows are unaffected (bracket_id stays null). Signatures unchanged.
-- ============================================================================

-- ---- 1. match_live_scores: nullable scope + bracket_id ---------------------
alter table public.match_live_scores
  alter column event_id drop not null,
  alter column division_id drop not null,
  add column if not exists bracket_id uuid references public.event_brackets(id) on delete cascade;

create index if not exists match_live_scores_bracket_idx on public.match_live_scores (bracket_id);

-- ---- 2. upsert_match_live_score: admit the standalone owner ----------------
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
    v_bracket_id  uuid;
    v_owner_id    uuid;
begin
    if p_kind = 'bracket' then
        -- LEFT join the division so a standalone bracket (division_id NULL)
        -- still resolves; v_bracket_id is the existence check (always set when
        -- the match exists), v_event_id may be NULL for standalone.
        select d.event_id, eb.division_id, eb.id, eb.owner_user_id
          into v_event_id, v_division_id, v_bracket_id, v_owner_id
          from public.bracket_matches bm
          join public.event_brackets eb on eb.id = bm.bracket_id
          left join public.event_divisions d on d.id = eb.division_id
         where bm.id = p_match_id;

        if v_bracket_id is null then
            raise exception 'bracket match % not found', p_match_id
                using errcode = 'P0002'; -- no_data_found
        end if;

        if not (
            (v_event_id is not null
                and (public.is_event_host(v_event_id) or public.is_bracket_match_captain(p_match_id)))
            or (v_owner_id is not null and v_owner_id = auth.uid())
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
        (match_id, kind, event_id, division_id, bracket_id, live_state, updated_by, updated_at)
    values
        (p_match_id, p_kind, v_event_id, v_division_id, v_bracket_id, p_live_state, auth.uid(), now())
    on conflict (match_id) do update
        set kind        = excluded.kind,
            event_id    = excluded.event_id,
            division_id = excluded.division_id,
            bracket_id  = excluded.bracket_id,
            live_state  = excluded.live_state,
            updated_by  = excluded.updated_by,
            updated_at  = excluded.updated_at;
end;
$$;

-- ---- 3. clear_match_live_score: admit the standalone owner -----------------
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
    v_bracket_id  uuid;
begin
    select kind, event_id, division_id, bracket_id
      into v_kind, v_event_id, v_division_id, v_bracket_id
      from public.match_live_scores
     where match_id = p_match_id;

    if not found then
        return; -- nothing live for this match
    end if;

    if v_kind = 'bracket' then
        if not (
            (v_event_id is not null
                and (public.is_event_host(v_event_id) or public.is_bracket_match_captain(p_match_id)))
            or exists (
                select 1 from public.event_brackets eb
                 where eb.id = v_bracket_id and eb.owner_user_id = auth.uid()
            )
        ) then
            raise exception 'not authorized to clear this match live score'
                using errcode = '42501'; -- insufficient_privilege
        end if;
    elsif v_kind = 'league' then
        if not (
            public.is_event_host_for_division(v_division_id)
            or public.is_league_match_captain(p_match_id)
        ) then
            raise exception 'not authorized to clear this match live score'
                using errcode = '42501'; -- insufficient_privilege
        end if;
    end if;

    delete from public.match_live_scores where match_id = p_match_id;
end;
$$;
