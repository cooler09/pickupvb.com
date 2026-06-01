import { createSupabaseAnonClient } from '@pickupvb/supabase/anon';
import { SupabaseGroupQueryRepository } from '@pickupvb/infrastructure';
import { Pagination } from '@/components/pagination';
import { primaryButtonClass } from '@/components/primary-button';
import { fieldInputClass } from '@/components/field-styles';
import { NewGroupButton } from './_components/new-group-button';
import { GroupCard } from './_components/group-card';
import { GroupsFollowProvider, GroupFollowButton } from './_components/groups-follow';

// Public listing rendered with the sessionless anon client so the route
// stays ISR-cacheable. Viewer-only chrome (the "+ New group" CTA) lives
// in a client component to avoid pulling `cookies()` into the RSC path.
export const revalidate = 60;

export const metadata = {
  title: 'Groups',
  description:
    'Discover volleyball groups and clubs on PickupVB. Find a regular crew, join a club, or start your own group.',
  alternates: { canonical: '/groups' },
  openGraph: {
    title: 'Volleyball groups · PickupVB',
    description:
      'Discover volleyball groups and clubs on PickupVB. Find a regular crew, join a club, or start your own.',
    url: '/groups',
    type: 'website',
    siteName: 'PickupVB',
  },
};

const PAGE_SIZE = 24;

export default async function GroupsIndexPage(props: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = createSupabaseAnonClient();
  const q = (searchParams.q ?? '').trim();
  const pageNum = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  const { cards: groups, total } = await new SupabaseGroupQueryRepository(supabase).searchDirectory(
    {
      ...(q ? { search: q } : {}),
      limit: PAGE_SIZE,
      offset: from,
    },
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Groups & organizations{' '}
            <span className="text-muted text-base font-normal">· {total}</span>
          </h1>
          <p className="text-muted text-sm">Clubs, leagues, and crews that host events.</p>
        </div>
        <NewGroupButton />
      </header>
      <form className="flex items-center gap-2">
        <input
          type="search"
          name="q"
          placeholder="Search by name, slug, or city…"
          defaultValue={q}
          className={`${fieldInputClass} flex-1`}
        />
        <button type="submit" className={primaryButtonClass()}>
          Search
        </button>
      </form>
      {groups.length === 0 ? (
        <div className="border-border-base rounded-shape-sm flex flex-col items-center gap-3 border border-dashed p-8 text-center">
          <p className="text-fg text-sm font-medium">
            {q ? 'No groups match your search.' : 'No groups yet.'}
          </p>
          <p className="text-muted text-xs">
            {q
              ? 'Try a different search term, or browse all groups.'
              : 'Be the first to create one — groups are how clubs and crews host events together.'}
          </p>
          {/* `<NewGroupButton />` self-hides for signed-out viewers, so this
              extra CTA only appears to people who can act on it. Anonymous
              visitors just see the encouraging copy above. */}
          <NewGroupButton />
        </div>
      ) : (
        <GroupsFollowProvider groupIds={groups.map((g) => g.id)}>
          <ul className="stagger-in grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} action={<GroupFollowButton groupId={g.id} />} />
            ))}
          </ul>
        </GroupsFollowProvider>
      )}
      <Pagination
        basePath="/groups"
        page={pageNum}
        pageSize={PAGE_SIZE}
        total={total}
        searchParams={searchParams}
      />
    </div>
  );
}
