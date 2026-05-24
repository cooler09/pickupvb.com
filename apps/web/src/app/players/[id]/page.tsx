import { notFound } from 'next/navigation';
import Image from 'next/image';
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
  const supabase = createSupabaseAnonClient();
  const { data } = await supabase
    .from('profiles_public')
    .select('handle, display_name, home_city')
    .eq('handle', params.id)
    .maybeSingle();
  const row = data as {
    handle: string;
    display_name: string | null;
    home_city: string | null;
  } | null;
  if (!row) return { title: 'Player' };
  const name = row.display_name || 'Player';
  const description = `${name}${row.home_city ? ` of ${row.home_city}` : ''} — volleyball player on PickupVB.`;
  return {
    title: name,
    description,
    alternates: { canonical: `/players/${row.handle}` },
    openGraph: {
      title: `${name} · PickupVB`,
      description,
      url: `/players/${row.handle}`,
      type: 'profile',
    },
  };
}

type PlayerProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  home_city: string | null;
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

function initialsOf(p: PlayerProfile): string {
  const parts = (p.display_name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (p.display_name ?? '?').slice(0, 2).toUpperCase();
}

function nameOf(p: PlayerProfile): string {
  return p.display_name || 'Player';
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

  const { data: profileRow } = await supabase
    .from('profiles_public')
    .select(
      'id, handle, display_name, avatar_url, home_city, show_pro_badge, primary_position, secondary_position, tertiary_position, instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url',
    )
    .eq('handle', params.id)
    .maybeSingle();

  const profile = profileRow as PlayerProfile | null;
  if (!profile) notFound();

  // Hosted events (upcoming + past split at SQL) + pro / admin badges are independent.
  const now = new Date();
  const [upcoming, past, isProHost, isAdmin] = await Promise.all([
    // RLS handles visibility — anon viewers only see public events.
    loadVisibleHostedEvents(supabase, profile.id, { startsAfter: now }),
    loadVisibleHostedEvents(supabase, profile.id, { startsBefore: now }),
    profile.show_pro_badge !== false ? isPro(profile.id) : Promise.resolve(false),
    isPlatformAdmin(profile.id),
  ]);

  const returnPath = `/players/${profile.handle}`;
  const name = nameOf(profile);

  const positions = [
    profile.primary_position,
    profile.secondary_position,
    profile.tertiary_position,
  ]
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
      {/* ── Identity card ─────────────────────────────────────── */}
      <header className="border-border-base bg-surface rounded-lg border p-5">
        <div className="flex items-start gap-4">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
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
            <p className="text-muted text-sm">{profile.home_city ?? 'No home city set'}</p>
            {positions.length > 0 && (
              <p className="text-muted mt-1 text-xs">{positions.join(' · ')}</p>
            )}
            <SocialLinks
              className="mt-3"
              handles={{
                instagramHandle: profile.instagram_handle,
                tiktokHandle: profile.tiktok_handle,
                twitterHandle: profile.twitter_handle,
                facebookHandle: profile.facebook_handle,
                youtubeHandle: profile.youtube_handle,
                websiteUrl: profile.website_url,
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
