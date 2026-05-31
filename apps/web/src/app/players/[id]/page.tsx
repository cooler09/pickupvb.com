import { notFound } from 'next/navigation';
import Image from 'next/image';
import type { PlayerProfile } from '@pickupvb/domain';
import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
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
import { HeroImage } from '@/components/hero-image';

/**
 * ISR cache for anonymous traffic. The public player profile (identity
 * card, positions, socials, hosted events) is fully cacheable. The CTA
 * row (follow / unfollow / sign-in / edit-profile) is rendered by
 * `<PlayerViewerActions />`, a client island that fetches the viewer's
 * session after hydration. See `docs/audits/performance.md` P1 #1.
 */
export const revalidate = 60;

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
  const ppage = Math.max(1, Number.parseInt(searchParams.ppage ?? '1', 10) || 1);
  const supabase = createSupabaseAnonClient();

  const profile = await new SupabaseProfileRepository(supabase).findPlayerByHandle(params.id);
  if (!profile) notFound();

  // Hosted events (upcoming + past split at SQL) + pro / admin badges are independent.
  const now = new Date();
  const [upcoming, past, isProHost, isAdmin] = await Promise.all([
    // RLS handles visibility — anon viewers only see public events.
    loadVisibleHostedEvents(supabase, profile.id, { startsAfter: now }),
    loadVisibleHostedEvents(supabase, profile.id, { startsBefore: now }),
    profile.showProBadge !== false ? isPro(profile.id) : Promise.resolve(false),
    isPlatformAdmin(profile.id),
  ]);

  const returnPath = `/players/${profile.handle}`;
  const name = nameOf(profile);

  const positions = [profile.primaryPosition, profile.secondaryPosition, profile.tertiaryPosition]
    .filter((p): p is string => !!p)
    .map((p) => POSITION_LABEL[p] ?? p);

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: 'https://pickupvb.com/' },
          { name: 'Players', url: 'https://pickupvb.com/players' },
          { name, url: `https://pickupvb.com/players/${profile.handle}` },
        ]}
      />
      <HeroImage url={profile.heroImageUrl} alt={name} priority />

      {/* ── Identity card ─────────────────────────────────────── */}
      <header className="border-border-base bg-surface rounded-shape-sm border p-5">
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
              className="bg-primary/15 text-primary flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-xl font-semibold"
            >
              {initialsOf(profile)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-fg truncate text-2xl font-bold">{name}</h1>
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

      <section className="space-y-3">
        <h2 className="text-fg text-lg font-semibold">
          Upcoming events{' '}
          <span className="text-muted text-sm font-normal">({upcoming.length})</span>
        </h2>
        <HostedEventsList
          events={upcoming}
          emptyState={`${name} isn't hosting any upcoming events you can see.`}
        />
      </section>
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
