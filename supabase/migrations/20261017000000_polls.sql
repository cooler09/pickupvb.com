-- ============================================================================
-- Public polls — sessionless multi-question responses.
-- See docs/adr/0041-public-polls.md
--
-- Context: hosts need to gather quick answers ("are you coming?" in a Facebook
-- Messenger group) from people who do NOT have — and may never want — a pickupvb
-- account. The only existing public write path is guest RSVP, which mints an
-- anonymous auth.users row and demands an email + Turnstile — far too heavy for
-- "tap a link, tap an answer." A poll is shared by an 8-char short code
-- (/p/ABCD1234); a total stranger opens it and answers with just a name.
--
-- Model: a poll is owned by a creator (host user) and OPTIONALLY scoped to an
-- event XOR a group. Config = poll → questions → options (each question is
-- single- or multi-select). Responses = one poll_responses row per respondent
-- (name + optional user_id + an anon cookie token) fanning out to poll_answers
-- (one row per chosen option). "Change my answer" upserts on the identity.
--
-- Trust boundary: config + response tables are NOT world-readable (that would
-- let anon enumerate every poll). The public responder page reads config via
-- the SECURITY DEFINER get_poll_config(code) RPC and the live tally via
-- get_poll_results(code) — the short code is the capability. Sessionless writes
-- go only through submit_poll_response(...), a SECURITY DEFINER RPC that
-- validates poll-open + every-required-answered + option-belongs-to-poll +
-- single-select-cardinality server-side (there is no authorization to enforce —
-- anyone may respond — only validation). Mirrors the definer-RPC-with-guard
-- shape of record_bracket_match_result (20260814000100), minus the auth gate.
--
-- Impact: five new tables + three RPCs (two granted to anon). Nothing existing
-- changes. Host-side create/edit/close/delete + the results dashboard run on the
-- user-scoped client so the creator-only RLS is the real gate.
-- ============================================================================

-- ---- Tables ---------------------------------------------------------------

create table public.polls (
    id                     uuid primary key default uuid_generate_v4(),
    short_code             text unique,
    creator_id             uuid not null references public.profiles(id) on delete cascade,
    event_id               uuid references public.events(id) on delete set null,
    group_id               uuid references public.groups(id) on delete set null,
    title                  text not null check (length(title) between 1 and 200),
    description            text not null default '',
    status                 text not null default 'open' check (status in ('open', 'closed')),
    closes_at              timestamptz,
    show_respondent_names  boolean not null default true,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now(),
    -- A poll attaches to at most one owning context (event XOR group).
    constraint polls_single_scope check (not (event_id is not null and group_id is not null))
);

create index polls_creator_idx on public.polls (creator_id);
create index polls_event_idx   on public.polls (event_id) where event_id is not null;
create index polls_group_idx   on public.polls (group_id) where group_id is not null;

create table public.poll_questions (
    id          uuid primary key default uuid_generate_v4(),
    poll_id     uuid not null references public.polls(id) on delete cascade,
    position    int not null,
    prompt      text not null check (length(prompt) between 1 and 300),
    kind        text not null check (kind in ('single', 'multi')),
    required    boolean not null default true,
    unique (poll_id, position)
);

create index poll_questions_poll_idx on public.poll_questions (poll_id);

create table public.poll_options (
    id           uuid primary key default uuid_generate_v4(),
    question_id  uuid not null references public.poll_questions(id) on delete cascade,
    position     int not null,
    label        text not null check (length(label) between 1 and 200),
    unique (question_id, position)
);

create index poll_options_question_idx on public.poll_options (question_id);

-- One row per respondent. `anon_token` is a random per-poll cookie value used to
-- upsert "change my answer" for a signed-out responder; `user_id` links the
-- response when the responder happens to be signed in (a bonus, never required).
create table public.poll_responses (
    id               uuid primary key default uuid_generate_v4(),
    poll_id          uuid not null references public.polls(id) on delete cascade,
    respondent_name  text not null check (length(respondent_name) between 1 and 120),
    user_id          uuid references public.profiles(id) on delete set null,
    anon_token       text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index poll_responses_poll_idx on public.poll_responses (poll_id);
-- "Change my answer" identity: one response per token, and one per signed-in user.
create unique index poll_responses_poll_token_key
    on public.poll_responses (poll_id, anon_token) where anon_token is not null;
create unique index poll_responses_poll_user_key
    on public.poll_responses (poll_id, user_id) where user_id is not null;

create table public.poll_answers (
    id                uuid primary key default uuid_generate_v4(),
    poll_response_id  uuid not null references public.poll_responses(id) on delete cascade,
    question_id       uuid not null references public.poll_questions(id) on delete cascade,
    option_id         uuid not null references public.poll_options(id) on delete cascade,
    unique (poll_response_id, option_id)
);

create index poll_answers_response_idx on public.poll_answers (poll_response_id);
create index poll_answers_option_idx   on public.poll_answers (option_id);
create index poll_answers_question_idx on public.poll_answers (question_id);

-- ---- Short-code trigger (mirrors events / community_listings) --------------

create or replace function public.polls_assign_short_code()
returns trigger
language plpgsql
as $$
declare
    candidate text;
    attempts  int := 0;
begin
    if new.short_code is not null then
        return new;
    end if;
    loop
        candidate := public.gen_event_short_code();
        begin
            new.short_code := candidate;
            return new;
        exception when unique_violation then
            attempts := attempts + 1;
            if attempts >= 5 then raise; end if;
        end;
    end loop;
end;
$$;

drop trigger if exists polls_assign_short_code on public.polls;
create trigger polls_assign_short_code
    before insert on public.polls
    for each row execute function public.polls_assign_short_code();

-- ---- updated_at maintenance ------------------------------------------------

create or replace function public.polls_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists polls_touch_updated_at on public.polls;
create trigger polls_touch_updated_at
    before update on public.polls
    for each row execute function public.polls_touch_updated_at();

-- ---- Authorization helper --------------------------------------------------

-- True when the current user owns the poll. SECURITY DEFINER so it can read the
-- (RLS-protected) polls row from inside a policy without recursing.
create or replace function public.is_poll_creator(p_poll_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1 from public.polls
        where id = p_poll_id and creator_id = auth.uid()
    );
$$;

-- ---- RLS -------------------------------------------------------------------

alter table public.polls          enable row level security;
alter table public.poll_questions enable row level security;
alter table public.poll_options   enable row level security;
alter table public.poll_responses enable row level security;
alter table public.poll_answers   enable row level security;

-- polls: creator-only for every verb. Public reads go through get_poll_config /
-- get_poll_results (definer RPCs), so there is NO public SELECT — a stranger with
-- the short code can view via the RPC but cannot enumerate the table.
create policy "polls_select" on public.polls
    for select using (creator_id = auth.uid());
create policy "polls_insert" on public.polls
    for insert with check (
        creator_id = auth.uid()
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    );
create policy "polls_update" on public.polls
    for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "polls_delete" on public.polls
    for delete using (creator_id = auth.uid());

-- Child config tables: gated to the owning poll's creator.
create policy "poll_questions_all" on public.poll_questions
    for all using (public.is_poll_creator(poll_id)) with check (public.is_poll_creator(poll_id));

create policy "poll_options_all" on public.poll_options
    for all
    using (
        exists (
            select 1 from public.poll_questions q
            where q.id = poll_options.question_id and public.is_poll_creator(q.poll_id)
        )
    )
    with check (
        exists (
            select 1 from public.poll_questions q
            where q.id = poll_options.question_id and public.is_poll_creator(q.poll_id)
        )
    );

-- Responses: creator-only SELECT (the host dashboard). No INSERT/UPDATE policy —
-- every write lands via submit_poll_response (SECURITY DEFINER, bypasses RLS).
create policy "poll_responses_select" on public.poll_responses
    for select using (public.is_poll_creator(poll_id));

create policy "poll_answers_select" on public.poll_answers
    for select
    using (
        exists (
            select 1 from public.poll_responses r
            where r.id = poll_answers.poll_response_id and public.is_poll_creator(r.poll_id)
        )
    );

-- ---- Public read RPCs (grant to anon + authenticated) ----------------------

-- Poll config for the public responder page, resolved by short code. Returns
-- null when the code is unknown. No respondent data — pure config.
create or replace function public.get_poll_config(p_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
    v_poll public.polls;
    v_result jsonb;
begin
    select * into v_poll from public.polls where short_code = upper(btrim(p_code));
    if not found then
        return null;
    end if;

    select jsonb_build_object(
        'id', v_poll.id,
        'short_code', v_poll.short_code,
        'title', v_poll.title,
        'description', v_poll.description,
        'status', v_poll.status,
        'closes_at', v_poll.closes_at,
        'show_respondent_names', v_poll.show_respondent_names,
        'questions', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'id', pq.id,
                    'prompt', pq.prompt,
                    'kind', pq.kind,
                    'required', pq.required,
                    'options', coalesce((
                        select jsonb_agg(
                            jsonb_build_object('id', po.id, 'label', po.label)
                            order by po.position
                        )
                        from public.poll_options po
                        where po.question_id = pq.id
                    ), '[]'::jsonb)
                )
                order by pq.position
            )
            from public.poll_questions pq
            where pq.poll_id = v_poll.id
        ), '[]'::jsonb)
    ) into v_result;

    return v_result;
end;
$$;

-- Live tally for the public page. Per-option counts, plus respondent names per
-- option ONLY when the poll's show_respondent_names toggle is on.
create or replace function public.get_poll_results(p_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
    v_poll public.polls;
    v_show boolean;
    v_result jsonb;
begin
    select * into v_poll from public.polls where short_code = upper(btrim(p_code));
    if not found then
        return null;
    end if;
    v_show := v_poll.show_respondent_names;

    select jsonb_build_object(
        'poll_id', v_poll.id,
        'total_respondents', (
            select count(*) from public.poll_responses where poll_id = v_poll.id
        ),
        'options', coalesce((
            select jsonb_object_agg(po.id, jsonb_build_object(
                'count', (select count(*) from public.poll_answers pa where pa.option_id = po.id),
                'names', case when v_show then (
                    select coalesce(jsonb_agg(pr.respondent_name order by pr.created_at), '[]'::jsonb)
                    from public.poll_answers pa
                    join public.poll_responses pr on pr.id = pa.poll_response_id
                    where pa.option_id = po.id
                ) else null end
            ))
            from public.poll_options po
            join public.poll_questions pq on pq.id = po.question_id
            where pq.poll_id = v_poll.id
        ), '{}'::jsonb)
    ) into v_result;

    return v_result;
end;
$$;

-- ---- Sessionless submit RPC (grant to anon + authenticated) ----------------

-- p_answers shape: [{ "question_id": uuid, "option_ids": [uuid, ...] }, ...]
-- Validates the poll is open, every required question is answered, every option
-- belongs to its claimed question within this poll, and single-select questions
-- carry at most one option. Upserts the respondent's row (keyed on the signed-in
-- user_id, else the anon cookie token) and replaces its answers. Returns
-- { "response_id": uuid }.
create or replace function public.submit_poll_response(
    p_code       text,
    p_name       text,
    p_anon_token text,
    p_answers    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_poll public.polls;
    v_uid uuid := auth.uid();
    v_name text;
    v_token text := nullif(btrim(coalesce(p_anon_token, '')), '');
    v_response_id uuid;
    v_is_first boolean := false;
begin
    select * into v_poll from public.polls where short_code = upper(btrim(p_code));
    if not found then
        raise exception 'poll not found' using errcode = 'P0002';
    end if;
    if v_poll.status <> 'open'
       or (v_poll.closes_at is not null and v_poll.closes_at < now()) then
        raise exception 'poll is closed' using errcode = 'P0001';
    end if;

    v_name := nullif(btrim(coalesce(p_name, '')), '');
    if v_name is null then
        raise exception 'name is required' using errcode = '22023';
    end if;
    v_name := left(v_name, 120);

    -- (A) every provided option must belong to its claimed question, in this poll.
    if exists (
        select 1
        from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
        cross join lateral jsonb_array_elements_text(coalesce(a->'option_ids', '[]'::jsonb)) opt(oid)
        where not exists (
            select 1
            from public.poll_options po
            join public.poll_questions pq on pq.id = po.question_id
            where po.id = opt.oid::uuid
              and po.question_id = (a->>'question_id')::uuid
              and pq.poll_id = v_poll.id
        )
    ) then
        raise exception 'invalid option in answers' using errcode = '22023';
    end if;

    -- (B) every required question must have at least one selected option.
    if exists (
        select 1
        from public.poll_questions pq
        where pq.poll_id = v_poll.id
          and pq.required
          and not exists (
              select 1
              from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
              where (a->>'question_id')::uuid = pq.id
                and jsonb_array_length(coalesce(a->'option_ids', '[]'::jsonb)) > 0
          )
    ) then
        raise exception 'a required question was not answered' using errcode = '22023';
    end if;

    -- (C) single-select questions carry at most one option.
    if exists (
        select 1
        from public.poll_questions pq
        join lateral (
            select coalesce(sum(jsonb_array_length(coalesce(a->'option_ids', '[]'::jsonb))), 0) as n
            from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
            where (a->>'question_id')::uuid = pq.id
        ) cnt on true
        where pq.poll_id = v_poll.id
          and pq.kind = 'single'
          and cnt.n > 1
    ) then
        raise exception 'single-select question has multiple answers' using errcode = '22023';
    end if;

    -- Resolve the existing response (upsert identity): prefer the signed-in user,
    -- then the anon cookie token.
    if v_uid is not null then
        select id into v_response_id
        from public.poll_responses
        where poll_id = v_poll.id and user_id = v_uid;
    end if;
    if v_response_id is null and v_token is not null then
        select id into v_response_id
        from public.poll_responses
        where poll_id = v_poll.id and anon_token = v_token;
    end if;

    if v_response_id is null then
        insert into public.poll_responses (poll_id, respondent_name, user_id, anon_token)
        values (v_poll.id, v_name, v_uid, v_token)
        returning id into v_response_id;
        -- First-ever response? Drives the host's one-time "first response" ping
        -- (the app enqueues it; the RPC just reports the fact, never the creator).
        select count(*) = 1 into v_is_first
        from public.poll_responses where poll_id = v_poll.id;
    else
        update public.poll_responses
            set respondent_name = v_name,
                user_id = coalesce(v_uid, user_id),
                anon_token = coalesce(v_token, anon_token),
                updated_at = now()
            where id = v_response_id;
        delete from public.poll_answers where poll_response_id = v_response_id;
    end if;

    insert into public.poll_answers (poll_response_id, question_id, option_id)
    select distinct v_response_id, (a->>'question_id')::uuid, opt.oid::uuid
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
    cross join lateral jsonb_array_elements_text(coalesce(a->'option_ids', '[]'::jsonb)) opt(oid);

    return jsonb_build_object(
        'response_id', v_response_id,
        'poll_id', v_poll.id,
        'is_first_response', v_is_first
    );
end;
$$;

grant execute on function public.get_poll_config(text)   to anon, authenticated;
grant execute on function public.get_poll_results(text)   to anon, authenticated;
grant execute on function public.submit_poll_response(text, text, text, jsonb) to anon, authenticated;
