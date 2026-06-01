import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getCurrentUser } from '@/lib/server-auth';
import { POSITION_LABEL } from '@/lib/enum-labels';
import { ProfileForm } from './profile-form';
import { HeroImagePanel } from '@/components/hero-image-panel';
import { Pagination } from '@/components/pagination';
import {
  SupabaseGroupQueryRepository,
  SupabaseSocialGraphRepository,
} from '@pickupvb/infrastructure';
import { FriendsList } from '@/components/friends-list';
import { HostedEventsList, loadVisibleHostedEvents } from '@/components/hosted-events-list';
import { MyGroupsSection, type MyGroup } from './_components/my-groups-section';
import { MyVideosSection } from './_components/my-videos-section';
import { HandleEditor } from './_components/handle-editor';
import { ListProfileMediaQuery } from '@pickupvb/application';
import { getMediaHandlers } from '@/lib/handlers';
import { ProBadge } from '@/components/pro-badge';
import { AdminBadge } from '@/components/admin-badge';
import { isPlatformAdmin } from '@/lib/admin';
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
  hero_image_url: string | null;
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

const cardClass = 'border-border-base bg-surface rounded-shape-sm border p-5 sm:p-6';

const HOSTED_PER_PAGE = 8;
const FOLLOWING_PER_PAGE = 24;
// Videos are embedded players (iframes) — keep the per-page count low.
const VIDEOS_PER_PAGE = 6;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export default async function ProfilePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawSearchParams = await props.searchParams;
  const searchParams: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(rawSearchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const hpage = Math.max(1, Number.parseInt(searchParams.hpage ?? '1', 10) || 1);
  const fpage = Math.max(1, Number.parseInt(searchParams.fpage ?? '1', 10) || 1);
  const vpage = Math.max(1, Number.parseInt(searchParams.vpage ?? '1', 10) || 1);

  const { supabase, user } = await getCurrentUser();
  if (!user) redirect('/login?next=/profile');

  const { data } = await supabase
    .from('profiles')
    .select(
      'handle, first_name, last_name, display_name, home_city, hero_image_url, auto_accept_team_invites, show_pro_badge, primary_position, secondary_position, tertiary_position, instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url',
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

  // Outgoing friend edges (people you've added) + incoming-edge user-id
  // set, used to flag mutual friendships in the FriendsList UI. Same
  // SocialGraphQueries port read as /friends.
  const { friends, mutualIds } = await new SupabaseSocialGraphRepository(supabase).getFriendEdges(
    user.id,
  );

  const hostedEvents = await loadVisibleHostedEvents(supabase, user.id, {
    startsAfter: new Date(),
  });
  const upcomingHosted = hostedEvents;
  const [viewerIsPro, viewerIsAdmin] = await Promise.all([
    isPro(user.id),
    isPlatformAdmin(user.id),
  ]);

  // Groups the user is a member of (with role).
  const memberships = await new SupabaseGroupQueryRepository(supabase).listMembershipsForUser(
    user.id,
  );

  // The user's own videos (active + auto-hidden) for the manage section.
  const { listProfileMedia } = await getMediaHandlers();
  const myVideos = await listProfileMedia.execute(new ListProfileMediaQuery(user.id, user.id));
  const groupsForSection: MyGroup[] = memberships.map((m) => ({
    id: m.group.id,
    slug: m.group.slug,
    name: m.group.name,
    avatarUrl: m.group.avatarUrl,
    homeCity: m.group.homeCity,
    role: m.role,
  }));

  // Outstanding team invites.
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

  const positions = [
    profile.primary_position,
    profile.secondary_position,
    profile.tertiary_position,
  ]
    .filter((p): p is string => Boolean(p))
    .map((p) => POSITION_LABEL[p] ?? p);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      {/* Identity hero */}
      <section className={cardClass}>
        <div className="flex items-start gap-4 sm:gap-5">
          <div
            aria-hidden
            className="bg-primary/15 text-primary flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold sm:h-20 sm:w-20 sm:text-2xl"
          >
            {initials(profile.display_name)}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-muted text-xs font-semibold tracking-wide uppercase">Your profile</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold">{profile.display_name}</h1>
              {viewerIsAdmin && <AdminBadge />}
              {viewerIsPro && <ProBadge asLink />}
            </div>
            <p className="text-muted text-sm">
              {profile.home_city ?? 'No home city set'}
              {user.email ? ` · ${user.email}` : ''}
            </p>
            {positions.length > 0 && <p className="text-muted text-xs">{positions.join(' · ')}</p>}
          </div>
          <Link
            href={`/players/${profile.handle}` as Route}
            className="border-border-base hover:bg-fg/5 shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium sm:text-sm"
          >
            Public view ↗
          </Link>
        </div>

        <div className="border-border-base mt-5 border-t pt-4">
          <HandleEditor currentHandle={profile.handle} />
        </div>
      </section>

      {/* Quick actions */}
      <nav aria-label="Quick actions" className="grid gap-3 sm:grid-cols-3">
        <ActionTile
          href={'/events/new' as Route}
          title="Host an event"
          description="Open play or tournament"
          variant="primary"
        />
        <ActionTile
          href={'/profile/billing' as Route}
          title="Payouts & Stripe"
          description="Connect your account"
        />
        <ActionTile
          href={'/profile/receipts' as Route}
          title="Receipts"
          description="Past payments"
        />
      </nav>

      {/* Action required */}
      {pendingInvites.length > 0 && (
        <section className="rounded-shape-sm space-y-3 border border-amber-500/40 bg-amber-500/5 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
              Pending team invites
            </h2>
            <span className="text-xs text-amber-700 dark:text-amber-400">
              {pendingInvites.length} waiting
            </span>
          </div>
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

      {/* Hosting */}
      <section id="hosting" className={cardClass}>
        <SectionHeader
          title="Hosting"
          count={upcomingHosted.length}
          countLabel="upcoming"
          action={{ href: '/events/new', label: '+ New event' }}
        />
        <div className="mt-4 space-y-4">
          <HostedEventsList
            events={upcomingHosted.slice((hpage - 1) * HOSTED_PER_PAGE, hpage * HOSTED_PER_PAGE)}
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
          <Pagination
            basePath="/profile"
            page={hpage}
            pageSize={HOSTED_PER_PAGE}
            total={upcomingHosted.length}
            searchParams={searchParams}
            pageParam="hpage"
            scrollToId="hosting"
          />
        </div>
      </section>

      {/* Groups */}
      <section className={cardClass}>
        <MyGroupsSection groups={groupsForSection} />
      </section>

      {/* Videos */}
      <section id="videos" className={cardClass}>
        <SectionHeader title="Videos" count={myVideos.length} />
        <div className="mt-4 space-y-4">
          <MyVideosSection
            items={myVideos.slice((vpage - 1) * VIDEOS_PER_PAGE, vpage * VIDEOS_PER_PAGE)}
          />
          <Pagination
            basePath="/profile"
            page={vpage}
            pageSize={VIDEOS_PER_PAGE}
            total={myVideos.length}
            searchParams={searchParams}
            pageParam="vpage"
            scrollToId="videos"
          />
        </div>
      </section>

      {/* Following */}
      <section id="following" className={cardClass}>
        <SectionHeader title="Following" count={friends.length} />
        <div className="mt-4 space-y-4">
          <FriendsList
            friends={friends.slice((fpage - 1) * FOLLOWING_PER_PAGE, fpage * FOLLOWING_PER_PAGE)}
            mutualIds={mutualIds}
            returnPath="/profile"
          />
          <Pagination
            basePath="/profile"
            page={fpage}
            pageSize={FOLLOWING_PER_PAGE}
            total={friends.length}
            searchParams={searchParams}
            pageParam="fpage"
            scrollToId="following"
          />
        </div>
      </section>

      {/* Edit profile */}
      <details className="group border-border-base bg-surface rounded-shape-sm border">
        <summary className="hover:bg-fg/5 flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-medium">
          <span>Edit profile</span>
          <span className="text-muted text-xs group-open:hidden">
            Name, city, positions, socials…
          </span>
          <span className="text-muted hidden text-xs group-open:inline">Collapse</span>
        </summary>
        <div className="border-border-base border-t p-4 sm:p-6">
          <ProfileForm profile={profile} email={user.email ?? ''} isPro={viewerIsPro} />
        </div>
      </details>

      <HeroImagePanel
        entityType="profiles"
        entityId={user.id}
        userId={user.id}
        currentUrl={row?.hero_image_url ?? null}
        returnPath={`/players/${profile.handle}`}
      />

      {/* Privacy & your data */}
      <section className={cardClass}>
        <SectionHeader title="Privacy & your data" />
        <p className="text-muted mt-2 text-sm">
          Download a copy of your PickupVB data — your profile, events, payments, messages, and more
          — as a single JSON file.
        </p>
        {/* Plain anchor: the route streams a file download (content-disposition:
            attachment), so a server-rendered link is all that's needed. */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href="/api/account/export"
            download
            className="border-border-base hover:bg-fg/5 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            Download my data
          </a>
          <Link
            href={'/profile/account/delete' as Route}
            className="text-sm font-medium text-red-600 hover:underline"
          >
            Delete account
          </Link>
        </div>
      </section>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  countLabel,
  action,
}: {
  title: string;
  count?: number;
  countLabel?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-bold">
        {title}
        {typeof count === 'number' && (
          <span className="text-muted ml-1.5 text-sm font-normal">
            ({count}
            {countLabel ? ` ${countLabel}` : ''})
          </span>
        )}
      </h2>
      {action && (
        <Link
          href={action.href as Route}
          className="text-primary text-sm font-medium hover:underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

function ActionTile({
  href,
  title,
  description,
  variant,
}: {
  href: Route;
  title: string;
  description: string;
  variant?: 'primary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <Link
      href={href}
      className={
        isPrimary
          ? 'bg-primary text-primary-fg rounded-shape-sm block p-4 transition hover:opacity-90'
          : 'border-border-base bg-surface hover:border-primary/40 rounded-shape-sm block border p-4 transition'
      }
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className={isPrimary ? 'mt-0.5 text-xs opacity-80' : 'text-muted mt-0.5 text-xs'}>
        {description}
      </p>
    </Link>
  );
}
