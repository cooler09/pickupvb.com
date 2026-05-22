import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/server-auth';
import { HostedEventsList } from '@/components/hosted-events-list';
import { loadVisibleGroupHostedEvents } from '@/components/group-hosted-events';
import { Pagination } from '@/components/pagination';
import { GroupHeader } from './_components/group-header';
import { MembersSection, type GroupMember } from './_components/members-section';
import { GroupJsonLd } from './_components/group-jsonld';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';

const PAST_EVENTS_PER_PAGE = 10;
const cardClass = 'border-border-base bg-surface rounded-lg border p-5 sm:p-6';

type GroupRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatar_url: string | null;
  home_city: string | null;
  region: string | null;
  created_by: string;
};

type MemberRow = {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  profiles: {
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    handle: string;
  } | null;
};

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from('groups')
    .select('slug, name, description, home_city, region')
    .eq('slug', params.id)
    .maybeSingle();
  const row = data as {
    slug: string;
    name: string;
    description: string | null;
    home_city: string | null;
    region: string | null;
  } | null;
  if (!row) return { title: 'Group' };
  const place = [row.home_city, row.region].filter(Boolean).join(', ');
  const description = row.description
    ? row.description.slice(0, 200)
    : `${row.name}${place ? ` — ${place}` : ''}. A volleyball group on PickupVB.`;
  return {
    title: row.name,
    description,
    alternates: { canonical: `/groups/${row.slug}` },
    openGraph: {
      title: `${row.name} · PickupVB`,
      description,
      url: `/groups/${row.slug}`,
      type: 'website',
    },
  };
}

export default async function GroupProfilePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const rawSearchParams = await props.searchParams;
  const searchParams: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(rawSearchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const mpage = Math.max(1, Number.parseInt(searchParams.mpage ?? '1', 10) || 1);
  const ppage = Math.max(1, Number.parseInt(searchParams.ppage ?? '1', 10) || 1);
  const supabase = await getServerSupabase();

  // Group lookup and viewer resolution are independent.
  const [{ data: groupData }, { user }] = await Promise.all([
    supabase
      .from('groups')
      .select('id, slug, name, description, avatar_url, home_city, region, created_by')
      .eq('slug', params.id)
      .maybeSingle(),
    getCurrentUser(),
  ]);
  const group = groupData as GroupRow | null;
  if (!group) notFound();

  // Members, follow-edge, and hosted events (upcoming + past split at SQL) are independent.
  const now = new Date();
  const [{ data: memberRows }, followRowResult, upcoming, past] = await Promise.all([
    supabase
      .from('group_members')
      .select(
        'user_id, role, profiles:profiles!inner(handle, display_name, first_name, last_name, avatar_url)',
      )
      .eq('group_id', group.id)
      .order('joined_at', { ascending: true }),
    user
      ? supabase
          .from('group_followers')
          .select('group_id')
          .eq('group_id', group.id)
          .eq('user_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    loadVisibleGroupHostedEvents(group.id, { startsAfter: now }),
    loadVisibleGroupHostedEvents(group.id, { startsBefore: now }),
  ]);
  const memberRowsTyped = (memberRows as MemberRow[] | null) ?? [];

  const myMembership = user ? (memberRowsTyped.find((m) => m.user_id === user.id) ?? null) : null;
  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';

  const isFollowing = Boolean(followRowResult.data);

  const returnPath = `/groups/${group.slug}`;

  // Map row shape to the component's camelCase prop shape.
  const members: GroupMember[] = memberRowsTyped.map((m) => ({
    userId: m.user_id,
    role: m.role,
    profile: m.profiles
      ? {
          displayName: m.profiles.display_name,
          firstName: m.profiles.first_name,
          lastName: m.profiles.last_name,
          avatarUrl: m.profiles.avatar_url,
          handle: m.profiles.handle,
        }
      : null,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: 'https://pickupvb.com/' },
          { name: 'Groups', url: 'https://pickupvb.com/groups' },
          { name: group.name, url: `https://pickupvb.com/groups/${group.slug}` },
        ]}
      />
      <GroupJsonLd
        slug={group.slug}
        name={group.name}
        description={group.description}
        homeCity={group.home_city}
        region={group.region}
        avatarUrl={group.avatar_url}
      />
      <GroupHeader
        group={{
          id: group.id,
          slug: group.slug,
          name: group.name,
          description: group.description,
          avatarUrl: group.avatar_url,
          homeCity: group.home_city,
          region: group.region,
        }}
        canManage={canManage}
        isSignedIn={!!user}
        isFollowing={isFollowing}
        returnPath={returnPath}
        stats={{ members: members.length, upcoming: upcoming.length }}
      />

      <section className={`${cardClass} space-y-4`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-fg text-lg font-semibold">
            Upcoming events{' '}
            <span className="text-muted text-sm font-normal">({upcoming.length})</span>
          </h2>
          {past.length > 0 && (
            <a href="#past-events" className="text-primary text-sm hover:underline">
              See past →
            </a>
          )}
        </div>
        <HostedEventsList
          events={upcoming}
          emptyState={`${group.name} isn't hosting any upcoming events you can see.`}
        />
      </section>

      <MembersSection
        groupSlug={group.slug}
        members={members}
        canManage={canManage}
        page={mpage}
        searchParams={searchParams}
      />

      {past.length > 0 && (
        <section id="past-events" className={`${cardClass} space-y-4`}>
          <h2 className="text-fg text-lg font-semibold">
            Past events <span className="text-muted text-sm font-normal">({past.length})</span>
          </h2>
          <HostedEventsList
            events={past.slice((ppage - 1) * PAST_EVENTS_PER_PAGE, ppage * PAST_EVENTS_PER_PAGE)}
            emptyState=""
          />
          <Pagination
            basePath={`/groups/${group.slug}`}
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
