import Image from 'next/image';
import Link from 'next/link';
import { createSupabaseAnonClient } from '@pickupvb/supabase/anon';
import { Pagination } from '@/components/pagination';
import { NewGroupButton } from './_components/new-group-button';

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

type GroupRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatar_url: string | null;
  home_city: string | null;
  region: string | null;
};

export default async function GroupsIndexPage(props: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = createSupabaseAnonClient();
  const q = (searchParams.q ?? '').trim();
  const pageNum = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('groups')
    .select('id, slug, name, description, avatar_url, home_city, region', {
      count: 'exact',
    })
    .order('name', { ascending: true })
    .range(from, to);
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,home_city.ilike.%${q}%`);

  const { data, count } = await query;
  const groups = (data as GroupRow[] | null) ?? [];
  const total = count ?? groups.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Groups & organizations</h1>
          <p className="text-muted text-sm">Clubs, leagues, and crews that host events.</p>
        </div>
        <NewGroupButton />
      </header>
      <form className="flex gap-2">
        <input
          type="search"
          name="q"
          placeholder="Search by name, slug, or city…"
          defaultValue={q}
          className="border-border-base bg-surface flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-2 text-sm"
        >
          Search
        </button>
      </form>
      {groups.length === 0 ? (
        <p className="border-border-base text-muted rounded-lg border border-dashed p-6 text-center text-sm">
          {q ? 'No groups match your search.' : 'No groups yet — be the first to create one.'}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/groups/${g.slug}`}
                className="border-border-base bg-surface hover:border-primary/40 flex items-start gap-3 rounded-lg border p-3"
              >
                {g.avatar_url ? (
                  <Image
                    src={g.avatar_url}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-md object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="bg-primary/15 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
                  >
                    {g.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{g.name}</p>
                  {g.home_city && (
                    <p className="text-muted truncate text-xs">
                      {g.home_city}
                      {g.region ? `, ${g.region}` : ''}
                    </p>
                  )}
                  {g.description && (
                    <p className="text-fg/80 mt-1 line-clamp-2 text-xs">{g.description}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
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
