import { notFound } from 'next/navigation';
import Image from 'next/image';
import type { PlayerProfile } from '@pickupvb/domain';
import { SupabaseProfileRepository, SupabaseMediaPostRepository } from '@pickupvb/infrastructure';
import { createSupabaseAnonClient } from '@pickupvb/supabase/anon';
import { POSITION_LABEL } from '@/lib/enum-labels';
import { HostedEventsList, loadVisibleHostedEvents } from '@/components/hosted-events-list';
import { Pagination } from '@/components/pagination';
import { ProBadge } from '@/components/pro-badge';
import { AdminBadge } from '@/components/admin-badge';
import { isPlatformAdmin } from '@/lib/admin';
import { SocialLinks } from '@/components/social-links';
import { isPro } from '@/lib/pro';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { PlayerViewerActions } from './_components/player-viewer-actions';
import { ProfileVideoGrid } from '@/components/profile-video-grid';
import { BadgeShelf } from '@/components/badge-shelf';
import { loadPublicBadges } from '@/lib/badges';

/**
 * ISR cache for anonymous traffic. The public player profile (identity
 * card, positions, socials, hosted events) is fully cacheable. The CTA
 * row (follow / unfollow / sign-in / edit-profile) is rendered by
 * `<PlayerViewerActions />`, a client island that fetches the viewer's
 * session after hydration. See `docs/audits/performance.md` P1 #1.
 */
export const revalidate = 60;

const UPCOMING_EVENTS_PER_PAGE = 10;
const PAST_EVENTS_PER_PAGE = 10;

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const profiles = new SupabaseProfileRepository(createSupabaseAnonClient());
  const card = await profiles.findCardByHandle(params.id);
  if (!card) return { title: 'Player' };
  const name = card.displayName || 'Player';
  const description = `${name}${card.homeCity ? ` of ${card.homeCity}` : ''} — volleyball player on PickupVB.`;
  return {
    title: name,
    description,
    alternates: { canonical: `/players/${card.handle}` },
    // Honor the discovery opt-out: a `discoverable = false` player stays
    // reachable by direct link but is de-indexed (and dropped from the
    // sitemap) so "stay private" isn't crawled. Default (null/true) indexes.
    ...(card.discoverable === false ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: `${name} · PickupVB`,
      description,
      url: `/players/${card.handle}`,
      type: 'profile',
    },
  };
}

function initialsOf(p: PlayerProfile): string {
  const parts = (p.displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (p.displayName ?? '?').slice(0, 2).toUpperCase();
}

function nameOf(p: PlayerProfile): string {
  return p.displayName || 'Player';
}

export default async function PlayerProfilePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const rawSearchParams = await props.searchParams;
  const searchParams: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(rawSearchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const upage = Math.max(1, Number.parseInt(searchParams.upage ?? '1', 10) || 1);
  const ppage = Math.max(1, Number.parseInt(searchParams.ppage ?? '1', 10) || 1);
  const supabase = createSupabaseAnonClient();

  const profile = await new SupabaseProfileRepository(supabase).findPlayerByHandle(params.id);
  if (!profile) notFound();

  // Hosted events (upcoming + past split at SQL) + pro / admin badges are independent.
  const now = new Date();
  const [upcoming, past, isProHost, isAdmin, videos, publicBadges] = await Promise.all([
    // RLS handles visibility — anon viewers only see public events.
    loadVisibleHostedEvents(supabase, profile.id, { startsAfter: now }),
    loadVisibleHostedEvents(supabase, profile.id, { startsBefore: now }),
    profile.showProBadge !== false ? isPro(profile.id) : Promise.resolve(false),
    isPlatformAdmin(profile.id),
    // Viewer-independent (anon client, active-only via RLS) so the page stays
    // ISR-cacheable.
    new SupabaseMediaPostRepository(supabase).listForProfile(profile.id, null),
    // Public trophy case — read from the user_badges_public view (anon-granted,
    // hidden badges already filtered), so it stays ISR-cacheable too.
    loadPublicBadges(supabase, profile.id),
  ]);

  const returnPath = `/players/${profile.handle}`;
  const name = nameOf(profile);

  const positions = [profile.primaryPosition, profile.secondaryPosition, profile.tertiaryPosition]
    .filter((p): p is string => !!p)
    .map((p) => POSITION_LABEL[p] ?? p);

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <BreadcrumbJsonLd
        trail={[
          { name: 'Players', path: '/players' },
          { name, path: `/players/${profile.handle}` },
        ]}
      />

      {/* ── Identity card ─────────────────────────────────────── */}
      <header className="border-border-base bg-md-surface-container rounded-shape-sm border p-5">
        <div className="flex items-start gap-4">
          {profile.avatarUrl ? (
            <Image
              src={profile.avatarUrl}
              alt=""
              width={72}
              height={72}
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="bg-primary/15 text-primary text-title-lg flex h-20 w-20 shrink-0 items-center justify-center rounded-full font-semibold"
            >
              {initialsOf(profile)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-fg text-headline-sm truncate font-bold">{name}</h1>
              {isAdmin && <AdminBadge />}
              {isProHost && <ProBadge />}
            </div>
            <p className="text-muted text-sm">{profile.homeCity ?? 'No home city set'}</p>
            {positions.length > 0 && (
              <p className="text-muted mt-1 text-xs">{positions.join(' · ')}</p>
            )}
            <SocialLinks
              className="mt-3"
              handles={{
                instagramHandle: profile.instagramHandle,
                tiktokHandle: profile.tiktokHandle,
                twitterHandle: profile.twitterHandle,
                facebookHandle: profile.facebookHandle,
                youtubeHandle: profile.youtubeHandle,
                websiteUrl: profile.websiteUrl,
              }}
            />
          </div>
        </div>

        {/* Primary CTA + share row */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PlayerViewerActions
            profileId={profile.id}
            profileHandle={profile.handle}
            profileName={name}
            returnPath={returnPath}
          />
        </div>
      </header>

      {/* Public trophy case — earned badges only (renders nothing when empty). */}
      <BadgeShelf
        earned={publicBadges.map((b) => ({
          badgeKey: b.badgeKey,
          awardedAt: new Date(b.awardedAt),
          source: b.source,
          label: typeof b.context?.label === 'string' ? b.context.label : null,
          iconUrl: typeof b.context?.iconUrl === 'string' ? b.context.iconUrl : null,
        }))}
        heading={`${name}'s badges`}
      />

      {/* "Hosting" — events this player is hosting. The section is host-scoped,
          so it's hidden entirely for the (majority) non-host player rather than
          showing an empty, mislabeled "Upcoming events (0)". Past-hosted events
          render in their own section below. */}
      {upcoming.length > 0 && (
        <section id="upcoming-events" className="space-y-3">
          <h2 className="text-fg text-lg font-semibold">
            Hosting <span className="text-muted text-sm font-normal">({upcoming.length})</span>
          </h2>
          <HostedEventsList
            events={upcoming.slice(
              (upage - 1) * UPCOMING_EVENTS_PER_PAGE,
              upage * UPCOMING_EVENTS_PER_PAGE,
            )}
            emptyState=""
          />
          <Pagination
            basePath={`/players/${profile.handle}`}
            page={upage}
            pageSize={UPCOMING_EVENTS_PER_PAGE}
            total={upcoming.length}
            searchParams={searchParams}
            pageParam="upage"
            scrollToId="upcoming-events"
          />
        </section>
      )}
      {videos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-fg text-lg font-semibold">
            Videos <span className="text-muted text-sm font-normal">({videos.length})</span>
          </h2>
          <ProfileVideoGrid items={videos} />
        </section>
      )}
      {past.length > 0 && (
        <section id="past-events" className="space-y-3">
          <h2 className="text-fg text-lg font-semibold">
            Past events <span className="text-muted text-sm font-normal">({past.length})</span>
          </h2>
          <HostedEventsList
            events={past.slice((ppage - 1) * PAST_EVENTS_PER_PAGE, ppage * PAST_EVENTS_PER_PAGE)}
            emptyState=""
          />
          <Pagination
            basePath={`/players/${profile.handle}`}
            page={ppage}
            pageSize={PAST_EVENTS_PER_PAGE}
            total={past.length}
            searchParams={searchParams}
            pageParam="ppage"
            scrollToId="past-events"
          />
        </section>
      )}
    </div>
  );
}
