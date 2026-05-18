import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/server-auth';
import { POSITION_LABEL } from '@/lib/enum-labels';
import { ProfileForm } from './profile-form';
import { FriendsList } from '@/components/friends-list';
import { HostedEventsList, loadVisibleHostedEvents } from '@/components/hosted-events-list';
import { MyGroupsSection, type MyGroup } from './_components/my-groups-section';
import { HandleEditor } from './_components/handle-editor';
import { ProBadge } from '@/components/pro-badge';
import { isPro } from '@/lib/pro';

export const metadata = {
  title: 'Your profile — PickupVB',
  robots: { index: false, follow: false },
};

type ProfileRow = {
  handle: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  home_city: string | null;
  auto_accept_team_invites: boolean | null;
  show_pro_badge: boolean | null;
  primary_position: string | null;
  secondary_position: string | null;
  tertiary_position: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  twitter_handle: string | null;
  facebook_handle: string | null;
  youtube_handle: string | null;
  website_url: string | null;
};

type FriendProfile = {
  id: string;
  handle: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  home_city: string | null;
};

export default async function ProfilePage() {
  const { supabase, user } = await getCurrentUser();
  if (!user) redirect('/login?next=/profile');

  const { data } = await supabase
    .from('profiles')
    .select(
      'handle, first_name, last_name, display_name, home_city, auto_accept_team_invites, show_pro_badge, primary_position, secondary_position, tertiary_position, instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url',
    )
    .eq('id', user.id)
    .maybeSingle();

  const row = data as ProfileRow | null;
  const profile = {
    handle: row?.handle ?? user.id,
    first_name: row?.first_name ?? null,
    last_name: row?.last_name ?? null,
    display_name: row?.display_name ?? user.email?.split('@')[0] ?? 'Player',
    home_city: row?.home_city ?? null,
    auto_accept_team_invites: row?.auto_accept_team_invites ?? false,
    show_pro_badge: row?.show_pro_badge ?? true,
    primary_position: row?.primary_position ?? null,
    secondary_position: row?.secondary_position ?? null,
    tertiary_position: row?.tertiary_position ?? null,
    instagram_handle: row?.instagram_handle ?? null,
    tiktok_handle: row?.tiktok_handle ?? null,
    twitter_handle: row?.twitter_handle ?? null,
    facebook_handle: row?.facebook_handle ?? null,
    youtube_handle: row?.youtube_handle ?? null,
    website_url: row?.website_url ?? null,
  };

  // Outgoing friend edges (people you've added).
  const { data: outRows } = await supabase
    .from('friendships')
    .select(
      'friend_id, profiles:profiles!friendships_friend_id_fkey(id, handle, display_name, first_name, last_name, avatar_url, home_city)',
    )
    .eq('user_id', user.id);

  type OutRow = { friend_id: string; profiles: FriendProfile | null };
  const out = (outRows as OutRow[] | null) ?? [];
  const friends: FriendProfile[] = out
    .map((r) => r.profiles)
    .filter((p): p is FriendProfile => p !== null);

  // Incoming edges (people who've added you) → used to flag mutual friendships.
  // RLS only lets you see rows where user_id = auth.uid(), so we ask for rows
  // where friend_id = us; per policy you can also see those because they are
  // your inbound edges if the policy allows. If not, this will simply return
  // an empty list and "mutual" badges won't appear — graceful degradation.
  const { data: inRows } = await supabase
    .from('friendships')
    .select('user_id')
    .eq('friend_id', user.id);
  const mutualIds = new Set(((inRows as { user_id: string }[] | null) ?? []).map((r) => r.user_id));

  const hostedEvents = await loadVisibleHostedEvents(user.id, { startsAfter: new Date() });
  const upcomingHosted = hostedEvents;
  const viewerIsPro = await isPro(user.id);

  // Groups the user is a member of (with role).
  const { data: myGroupRows } = await supabase
    .from('group_members')
    .select('role, groups:groups!inner(id, slug, name, avatar_url, home_city)')
    .eq('user_id', user.id);
  type MyGroupRow = {
    role: 'owner' | 'admin' | 'member';
    groups: {
      id: string;
      slug: string;
      name: string;
      avatar_url: string | null;
      home_city: string | null;
    } | null;
  };
  const myGroups = ((myGroupRows as MyGroupRow[] | null) ?? []).filter(
    (r): r is MyGroupRow & { groups: NonNullable<MyGroupRow['groups']> } => r.groups !== null,
  );
  const groupsForSection: MyGroup[] = myGroups.map((r) => ({
    id: r.groups.id,
    slug: r.groups.slug,
    name: r.groups.name,
    avatarUrl: r.groups.avatar_url,
    homeCity: r.groups.home_city,
    role: r.role,
  }));

  // Outstanding team invites — surfaces in a callout near the top so the
  // user notices without having to navigate to /teams.
  const { data: pendingRows } = await supabase
    .from('team_members')
    .select('teams:teams!inner(id, slug, name, format)')
    .eq('user_id', user.id)
    .eq('status', 'pending');
  type PendingRow = {
    teams: { id: string; slug: string; name: string; format: string } | null;
  };
  const pendingInvites = ((pendingRows as PendingRow[] | null) ?? [])
    .map((r) => r.teams)
    .filter((t): t is NonNullable<PendingRow['teams']> => t !== null);

  return (
    <div className="mx-auto max-w-xl space-y-8 py-4">
      {/* ── Identity header: who you are at a glance ────────────── */}
      <section className="border-border-base bg-surface space-y-4 rounded-lg border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-muted text-xs font-semibold tracking-wide uppercase">Your profile</p>
            <h1 className="truncate text-2xl font-bold">{profile.display_name}</h1>
            {viewerIsPro && <ProBadge asLink />}
            <p className="text-muted text-sm">
              {profile.home_city ?? 'No home city set'}
              {user.email ? ` · ${user.email}` : ''}
            </p>
            {(profile.primary_position ||
              profile.secondary_position ||
              profile.tertiary_position) && (
              <p className="text-muted text-xs">
                {[profile.primary_position, profile.secondary_position, profile.tertiary_position]
                  .filter((p): p is string => Boolean(p))
                  .map((p) => POSITION_LABEL[p] ?? p)
                  .join(' · ')}
              </p>
            )}
          </div>
          <Link
            href={`/players/${profile.handle}` as Route}
            className="border-border-base hover:bg-fg/5 shrink-0 rounded-md border px-3 py-1.5 text-sm"
          >
            Public view ↗
          </Link>
        </div>

        <HandleEditor currentHandle={profile.handle} />

        {/* Primary CTAs — visible without scrolling */}
        <div className="grid gap-2 sm:grid-cols-3">
          <Link
            href={'/events/new' as Route}
            className="bg-primary text-primary-fg rounded-md px-3 py-2 text-center text-sm font-medium hover:opacity-90"
          >
            + New event
          </Link>
          <Link
            href={'/profile/billing' as Route}
            className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-2 text-center text-sm"
          >
            Payouts &amp; Stripe →
          </Link>
          <Link
            href={'/profile/receipts' as Route}
            className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-2 text-center text-sm"
          >
            Receipts →
          </Link>
        </div>
      </section>

      {/* ── Anything that needs you to act ──────────────────────── */}
      {pendingInvites.length > 0 && (
        <section className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="text-sm font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
            Pending team invites ({pendingInvites.length})
          </h2>
          <ul className="space-y-2">
            {pendingInvites.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/teams/${t.slug}` as Route}
                  className="border-border-base bg-surface hover:border-primary/40 flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <span className="truncate font-medium">{t.name}</span>
                  <span className="text-primary shrink-0 text-xs">Respond →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Your stuff ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold">
            Hosting{' '}
            <span className="text-muted text-sm font-normal">
              ({upcomingHosted.length} upcoming)
            </span>
          </h2>
          <Link
            href={'/events/new' as Route}
            className="text-primary text-sm font-medium hover:underline"
          >
            + New event
          </Link>
        </div>
        <HostedEventsList
          events={upcomingHosted}
          emptyState={
            <>
              No upcoming events yet.{' '}
              <Link
                href={'/events/new' as Route}
                className="text-primary font-medium hover:underline"
              >
                Create your first event →
              </Link>
            </>
          }
        />
      </section>

      <MyGroupsSection groups={groupsForSection} />

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold">
            Following <span className="text-muted text-sm font-normal">({friends.length})</span>
          </h2>
        </div>
        <FriendsList friends={friends} mutualIds={mutualIds} returnPath="/profile" />
      </section>

      {/* ── Edit (rare; collapsed by default) ───────────────────── */}
      <details className="group border-border-base bg-surface rounded-lg border">
        <summary className="hover:bg-fg/5 flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-medium">
          <span>Edit profile</span>
          <span className="text-muted text-xs group-open:hidden">Name, city, positions…</span>
          <span className="text-muted hidden text-xs group-open:inline">Collapse</span>
        </summary>
        <div className="border-border-base border-t p-4">
          <ProfileForm profile={profile} email={user.email ?? ''} isPro={viewerIsPro} />
        </div>
      </details>
    </div>
  );
}
