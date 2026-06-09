import Link from 'next/link';
import Image from 'next/image';
import type { Route } from 'next';
import { EventCard } from '../../events/_components/event-card';
import { Pagination } from '@/components/pagination';
import { FriendsList } from '@/components/friends-list';
import { HostedEventsList } from '@/components/hosted-events-list';
import { MyVideosSection } from './my-videos-section';
import { HandleEditor } from './handle-editor';
import { ProBadge } from '@/components/pro-badge';
import { AdminBadge } from '@/components/admin-badge';
import { ActionTile, SectionHeader, cardClass } from './profile-section-primitives';
import { PROFILE_PAGE_SIZES, type ProfilePageModel } from '../_loaders/load-profile-page';

type Model = ProfilePageModel;
type SearchParams = Record<string, string | undefined>;

/** Avatar + name + badges + handle editor + "public view" link. */
export function ProfileIdentityHero({
  profile,
  userEmail,
  displayInitials,
  positions,
  viewerIsAdmin,
  viewerIsPro,
  hasPublicHandle,
}: {
  profile: Model['profile'];
  userEmail: string;
  displayInitials: string;
  positions: string[];
  viewerIsAdmin: boolean;
  viewerIsPro: boolean;
  hasPublicHandle: boolean;
}) {
  return (
    <section className={cardClass}>
      <div className="flex items-start gap-4 sm:gap-5">
        {profile.avatar_url ? (
          <Image
            src={profile.avatar_url}
            alt=""
            width={80}
            height={80}
            className="h-16 w-16 shrink-0 rounded-full object-cover sm:h-20 sm:w-20"
          />
        ) : (
          <div
            aria-hidden
            className="bg-primary/15 text-primary text-title-lg sm:text-headline-sm flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-semibold sm:h-20 sm:w-20"
          >
            {displayInitials}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">Your profile</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-headline-sm truncate font-bold">{profile.display_name}</h1>
            {viewerIsAdmin && <AdminBadge />}
            {viewerIsPro && <ProBadge asLink />}
          </div>
          <p className="text-muted text-sm">
            {profile.home_city ?? 'No home city set'}
            {userEmail ? ` · ${userEmail}` : ''}
          </p>
          {positions.length > 0 && <p className="text-muted text-xs">{positions.join(' · ')}</p>}
        </div>
        {hasPublicHandle && (
          <Link
            href={`/players/${profile.handle}` as Route}
            className="border-border-base hover:bg-fg/5 shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium sm:text-sm"
          >
            Public view ↗
          </Link>
        )}
      </div>

      <div className="border-border-base mt-5 border-t pt-4">
        <HandleEditor currentHandle={profile.handle} />
      </div>
    </section>
  );
}

/** Quick-actions grid; the payout tile copy adapts to host status. */
export function ProfileQuickActions({ isHost }: { isHost: boolean }) {
  return (
    <nav aria-label="Quick actions" className="grid gap-3 sm:grid-cols-3">
      <ActionTile
        href={'/events' as Route}
        title="Find events"
        description="Pickup, leagues & tournaments"
        variant="primary"
      />
      <ActionTile href={'/messages' as Route} title="Messages" description="Your conversations" />
      <ActionTile
        href={'/profile/notifications' as Route}
        title="Notifications"
        description="Email, push & in-app"
      />
      <ActionTile
        href={'/profile/receipts' as Route}
        title="Receipts"
        description="Your payments"
      />
      <ActionTile
        href={'/profile/passes' as Route}
        title="My passes"
        description="Prepaid session credits"
      />
      <ActionTile
        href={'/events/new' as Route}
        title="Host an event"
        description="Open play or tournament"
      />
      <ActionTile
        href={'/profile/billing' as Route}
        title={isHost ? 'Payouts & Stripe' : 'Get set up to sell tickets'}
        description={isHost ? 'Manage your payouts' : 'Connect Stripe to take payments'}
      />
    </nav>
  );
}

/** "Pending team invites" call-out (only when there are invites). */
export function PendingInvitesSection({ invites }: { invites: Model['pendingInvites'] }) {
  return (
    <section className="rounded-shape-sm border-md-warning/40 bg-md-warning/5 space-y-3 border p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-md-warning text-sm font-semibold tracking-wide uppercase">
          Pending team invites
        </h2>
        <span className="text-md-warning text-xs">{invites.length} waiting</span>
      </div>
      <ul className="space-y-2">
        {invites.map((t) => (
          <li key={t.id}>
            <Link
              href={`/teams/${t.slug}` as Route}
              className="border-border-base bg-md-surface-container hover:border-primary/40 flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <span className="truncate font-medium">{t.name}</span>
              <span className="text-primary shrink-0 text-xs">Respond →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Your events" (individual RSVPs), paged via `apage`. */
export function YourEventsSection({
  events,
  page,
  searchParams,
}: {
  events: Model['attendingEvents'];
  page: number;
  searchParams: SearchParams;
}) {
  const per = PROFILE_PAGE_SIZES.attending;
  return (
    <section id="your-events" className={cardClass}>
      <SectionHeader
        title="Your events"
        count={events.length}
        countLabel="upcoming"
        action={{ href: '/events', label: 'Find events' }}
      />
      <div className="mt-4 space-y-4">
        {events.length === 0 ? (
          <p className="border-border-base text-muted rounded-shape-sm border border-dashed p-4 text-sm">
            You haven&apos;t joined any upcoming events.{' '}
            <Link href={'/events' as Route} className="text-primary font-medium hover:underline">
              Find one near you →
            </Link>
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {events.slice((page - 1) * per, page * per).map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </ul>
        )}
        <Pagination
          basePath="/profile"
          page={page}
          pageSize={per}
          total={events.length}
          searchParams={searchParams}
          pageParam="apage"
          scrollToId="your-events"
        />
      </div>
    </section>
  );
}

/** "Following" list, paged via `fpage`. */
export function FollowingSection({
  friends,
  mutualIds,
  page,
  searchParams,
}: {
  friends: Model['friends'];
  mutualIds: Model['mutualIds'];
  page: number;
  searchParams: SearchParams;
}) {
  const per = PROFILE_PAGE_SIZES.following;
  return (
    <section id="following" className={cardClass}>
      <SectionHeader title="Following" count={friends.length} />
      <div className="mt-4 space-y-4">
        <FriendsList
          friends={friends.slice((page - 1) * per, page * per)}
          mutualIds={mutualIds}
          returnPath="/profile"
        />
        <Pagination
          basePath="/profile"
          page={page}
          pageSize={per}
          total={friends.length}
          searchParams={searchParams}
          pageParam="fpage"
          scrollToId="following"
        />
      </div>
    </section>
  );
}

/** "Hosting" list, paged via `hpage`. */
export function HostingSection({
  events,
  page,
  searchParams,
}: {
  events: Model['upcomingHosted'];
  page: number;
  searchParams: SearchParams;
}) {
  const per = PROFILE_PAGE_SIZES.hosted;
  return (
    <section id="hosting" className={cardClass}>
      <SectionHeader
        title="Hosting"
        count={events.length}
        countLabel="upcoming"
        action={{ href: '/events/new', label: '+ New event' }}
      />
      <div className="mt-4 space-y-4">
        <HostedEventsList
          events={events.slice((page - 1) * per, page * per)}
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
          page={page}
          pageSize={per}
          total={events.length}
          searchParams={searchParams}
          pageParam="hpage"
          scrollToId="hosting"
        />
      </div>
    </section>
  );
}

/** "Videos" manage list, paged via `vpage`. */
export function VideosSection({
  items,
  page,
  searchParams,
}: {
  items: Model['myVideos'];
  page: number;
  searchParams: SearchParams;
}) {
  const per = PROFILE_PAGE_SIZES.videos;
  return (
    <section id="videos" className={cardClass}>
      <SectionHeader title="Videos" count={items.length} />
      <div className="mt-4 space-y-4">
        <MyVideosSection items={items.slice((page - 1) * per, page * per)} />
        <Pagination
          basePath="/profile"
          page={page}
          pageSize={per}
          total={items.length}
          searchParams={searchParams}
          pageParam="vpage"
          scrollToId="videos"
        />
      </div>
    </section>
  );
}
