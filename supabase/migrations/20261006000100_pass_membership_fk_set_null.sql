-- ============================================================================
-- Pass / membership FKs: CASCADE → SET NULL on the profiles references — privacy
-- audit #21 (data preservation + account-deletion correctness).
--
-- Context: P1 #3 (20260620000000) established that EVERY payment/financial FK to
-- public.profiles is ON DELETE SET NULL so the record survives an account
-- deletion (ADR 0029) for tax / reconciliation — event_tips.host_id,
-- host_stripe_accounts.user_id, host_subscriptions.user_id, event_attendees.user_id,
-- event_team_payments.captain_id. The season-pass (20260930000000) + host-membership
-- (20261001000000) tables broke that rule: pass_purchases / host_memberships point
-- host_id / buyer_user_id / member_user_id at profiles with ON DELETE CASCADE, and
-- their product tables (host_passes / host_membership_plans) CASCADE host_id too.
-- Two live failure modes once a host self-deletes:
--   (a) buyer/member deletion silently destroys their paid-purchase record — the
--       SOLE platform ledger of the sale (passes aren't written to
--       event_payment_audit in v1, ADR 0037 Decision #2); and
--   (b) a host delete cascades into BOTH the product table and the purchase table
--       from one parent, where the purchase's product FK (pass_id / plan_id) is
--       ON DELETE RESTRICT — so depending on PG's cascade ordering the RESTRICT
--       trips and aborts auth.admin.deleteUser, leaving the user's email in
--       auth.users after the deletion request was already marked `executed`.
--
-- Impact: flips the six profiles-referencing FKs on host_passes,
-- host_membership_plans, pass_purchases, host_memberships to ON DELETE SET NULL
-- and drops their NOT NULL. After this a deleted user's product/purchase rows
-- survive with the user nulled (preserved for reconciliation, invisible to every
-- live reader — all reads filter `.eq(<col>, uid)`, which a NULL can't match),
-- and nothing cascade-deletes through the product table so the pass_id / plan_id
-- RESTRICT can never deadlock the purge. No RLS change is needed (the policies
-- compare `auth.uid() = <col>`; NULL yields NULL → row filtered out, the intended
-- "orphan is invisible" behaviour). redeem_pass_credit's ownership guard is
-- hardened from `<>` to `is distinct from` so a NULL buyer can't slip past it
-- (the only column-nullability consequence in SQL — claim_membership_spot already
-- matches with `= v_uid`, which a NULL can't satisfy). Generated types were
-- hand-edited to make the six columns nullable and will be regenerated against the
-- deployed schema on the next gen:types.
-- ============================================================================

-- ---- 1. host_passes.host_id -------------------------------------------------
alter table public.host_passes
  alter column host_id drop not null,
  drop constraint if exists host_passes_host_id_fkey,
  add constraint host_passes_host_id_fkey
    foreign key (host_id) references public.profiles(id) on delete set null;

-- ---- 2. host_membership_plans.host_id ---------------------------------------
alter table public.host_membership_plans
  alter column host_id drop not null,
  drop constraint if exists host_membership_plans_host_id_fkey,
  add constraint host_membership_plans_host_id_fkey
    foreign key (host_id) references public.profiles(id) on delete set null;

-- ---- 3. pass_purchases.host_id + buyer_user_id ------------------------------
alter table public.pass_purchases
  alter column host_id drop not null,
  alter column buyer_user_id drop not null,
  drop constraint if exists pass_purchases_host_id_fkey,
  drop constraint if exists pass_purchases_buyer_user_id_fkey,
  add constraint pass_purchases_host_id_fkey
    foreign key (host_id) references public.profiles(id) on delete set null,
  add constraint pass_purchases_buyer_user_id_fkey
    foreign key (buyer_user_id) references public.profiles(id) on delete set null;

-- ---- 4. host_memberships.host_id + member_user_id ---------------------------
alter table public.host_memberships
  alter column host_id drop not null,
  alter column member_user_id drop not null,
  drop constraint if exists host_memberships_host_id_fkey,
  drop constraint if exists host_memberships_member_user_id_fkey,
  add constraint host_memberships_host_id_fkey
    foreign key (host_id) references public.profiles(id) on delete set null,
  add constraint host_memberships_member_user_id_fkey
    foreign key (member_user_id) references public.profiles(id) on delete set null;

-- ---- 5. redeem_pass_credit: null-safe ownership guard -----------------------
-- buyer_user_id is now nullable; the previous `<> v_uid` guard yields NULL (not
-- TRUE) for an orphaned (deleted-buyer) purchase, so it would not raise. Switch
-- to `is distinct from`, which treats NULL as "not the caller" and rejects it.
-- Otherwise byte-identical to 20260930000000.
create or replace function public.redeem_pass_credit(p_purchase_id uuid, p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_purchase     public.pass_purchases%rowtype;
  v_event        public.events%rowtype;
  v_division_id  uuid;
  v_participant_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Lock the purchase row so concurrent redemptions can't overdraw the balance.
  select * into v_purchase
    from public.pass_purchases
   where id = p_purchase_id
   for update;
  if not found or v_purchase.buyer_user_id is distinct from v_uid then
    raise exception 'purchase_not_found';
  end if;
  if v_purchase.payment_status <> 'paid' then
    raise exception 'purchase_not_paid';
  end if;
  if v_purchase.expires_at is not null and v_purchase.expires_at <= now() then
    raise exception 'purchase_expired';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found';
  end if;
  if v_event.host_id <> v_purchase.host_id then
    raise exception 'event_host_mismatch';
  end if;
  if v_event.type <> 'open_play' then
    raise exception 'event_not_open_play';
  end if;
  if v_event.accepts_pass_credits is not true then
    raise exception 'event_not_pass_eligible';
  end if;

  -- Default (sort_order 0) division of the event.
  select id into v_division_id
    from public.event_divisions
   where event_id = p_event_id
   order by sort_order asc
   limit 1;
  if v_division_id is null then
    raise exception 'no_division';
  end if;

  -- Remaining credits read straight off the locked row.
  if v_purchase.credits_used >= v_purchase.credits_total then
    raise exception 'no_credits';
  end if;

  if exists (
    select 1 from public.event_participants
     where division_id = v_division_id and user_id = v_uid and role = 'attendee'
  ) then
    raise exception 'already_joined';
  end if;

  -- Reserve the spot. The capacity trigger fires and raises if the event is
  -- full; that propagates out of this function and rolls the transaction back.
  insert into public.event_participants (division_id, user_id, role)
  values (v_division_id, v_uid, 'attendee')
  returning id into v_participant_id;

  insert into public.event_participant_payments
    (participant_id, payment_status, amount_paid_cents, paid_at, pass_purchase_id)
  values (v_participant_id, 'paid', 0, now(), v_purchase.id);

  -- Consume the credit. The matching decrement lives in the AFTER DELETE
  -- trigger on event_participant_payments (cancel/leave returns the credit).
  update public.pass_purchases
     set credits_used = credits_used + 1
   where id = v_purchase.id;

  return v_participant_id;
end;
$$;

grant execute on function public.redeem_pass_credit(uuid, uuid) to authenticated;
