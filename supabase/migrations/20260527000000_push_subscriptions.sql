-- Web push subscription storage. Each row corresponds to one browser/device
-- on which the user has granted notification permission and called
-- `pushManager.subscribe()` against our VAPID public key.
--
-- The PushSubscription JSON shape is `{ endpoint, keys: { p256dh, auth } }`.
-- We unpack it into columns so we can dedupe by endpoint without parsing JSON.

create table if not exists public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    failure_count integer not null default 0
);

create index if not exists push_subscriptions_user_idx
    on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Users may read and manage only their own subscriptions. The server worker
-- bypasses RLS via the service role to deliver pushes.
create policy push_subscriptions_select_own
    on public.push_subscriptions
    for select
    using (auth.uid() = user_id);

create policy push_subscriptions_insert_own
    on public.push_subscriptions
    for insert
    with check (auth.uid() = user_id);

create policy push_subscriptions_delete_own
    on public.push_subscriptions
    for delete
    using (auth.uid() = user_id);
