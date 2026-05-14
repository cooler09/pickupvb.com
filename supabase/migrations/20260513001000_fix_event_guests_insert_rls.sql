-- ============================================================================
-- Fix: anon guest signups fail with "new row violates row-level security
-- policy for table event_guests".
--
-- Cause: event_guests_insert checked
--   exists (select 1 from events e where e.id = ... and e.status='published')
-- That subquery is itself filtered by `events` RLS, so anon visitors can only
-- "see" public events through it — signing up for a friends_of_host or
-- friends_of_attendees event always failed the WITH CHECK.
--
-- Fix: route the existence check through a SECURITY DEFINER helper that
-- bypasses RLS. Visibility is still enforced separately — the guest only
-- reaches the form by viewing the event page, which goes through events_view
-- RLS, and the RPC merely confirms the event is published.
-- ============================================================================

create or replace function public.event_is_published(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
     where e.id = p_event_id
       and e.status = 'published'
  );
$$;
grant execute on function public.event_is_published(uuid) to anon, authenticated;

drop policy if exists event_guests_insert on public.event_guests;

create policy event_guests_insert on public.event_guests for insert
  with check (public.event_is_published(event_id));
