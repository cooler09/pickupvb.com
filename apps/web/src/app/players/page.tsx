import Image from 'next/image';
import Link from 'next/link';
import { createSupabaseAnonClient } from '@pickupvb/supabase/anon';
import { Pagination } from '@/components/pagination';

// Public listing; no viewer-specific state. Rendered with the sessionless
// anon client so the route stays ISR-cacheable. Mutations elsewhere should
// `revalidatePath('/players')` if they change the listing (today profile
// edits don't, so a 60s baseline TTL is plenty).
export const revalidate = 60;

export const metadata = {
  title: 'Players',
  description:
    'Discover volleyball players on PickupVB. Find people in your area, see who is signed up for events, and connect with teammates.',
  alternates: { canonical: '/players' },
  openGraph: {
    title: 'Volleyball players · PickupVB',
    description:
      'Discover volleyball players on PickupVB. Find people in your area and connect with teammates.',
    url: '/players',
    type: 'website',
    siteName: 'PickupVB',
  },
};

const PAGE_SIZE = 24;

type Row = {
  id: string;
  handle: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  home_city: string | null;
  avatar_url: string | null;
};

function nameOf(p: Row): string {
  const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return full || p.display_name || 'Player';
}

function initialsOf(p: Row): string {
  const f = p.first_name?.trim()?.[0];
  const l = p.last_name?.trim()?.[0];
  if (f && l) return (f + l).toUpperCase();
  const parts = (p.display_name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (p.display_name ?? '?').slice(0, 2).toUpperCase();
}

export default async function PlayersIndexPage(props: {
  searchParams: Promise<{ q?: string; city?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = createSupabaseAnonClient();
  const q = (searchParams.q ?? '').trim();
  const city = (searchParams.city ?? '').trim();
  const pageNum = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('profiles')
    .select('id, handle, display_name, first_name, last_name, home_city, avatar_url', {
      count: 'exact',
    })
    .order('display_name', { ascending: true })
    .range(from, to);

  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(`display_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`);
  }
  if (city) {
    query = query.ilike('home_city', `%${city.replace(/[%_]/g, (m) => `\\${m}`)}%`);
  }

  const { data, count } = await query;
  const players = (data as Row[] | null) ?? [];
  const total = count ?? players.length;
  const hasFilter = q.length > 0 || city.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4">
      <header>
        <h1 className="text-2xl font-bold">Players</h1>
        <p className="text-muted text-sm">
          Find people to follow, add to your team, or invite to a group.
        </p>
      </header>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="search"
          name="q"
          placeholder="Search by name…"
          defaultValue={q}
          className="border-border-base bg-surface rounded-md border px-3 py-2 text-sm"
        />
        <input
          type="search"
          name="city"
          placeholder="Home city"
          defaultValue={city}
          className="border-border-base bg-surface rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-2 text-sm"
        >
          Search
        </button>
      </form>
      {players.length === 0 ? (
        <p className="border-border-base text-muted rounded-lg border border-dashed p-6 text-center text-sm">
          {hasFilter
            ? 'No players match those filters.'
            : 'No players yet — be the first to sign up.'}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {players.map((p) => (
            <li key={p.id}>
              <Link
                href={`/players/${p.handle}`}
                className="border-border-base bg-surface hover:border-primary/40 flex items-center gap-3 rounded-lg border p-3"
              >
                {p.avatar_url ? (
                  <Image
                    src={p.avatar_url}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="bg-primary/15 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  >
                    {initialsOf(p)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{nameOf(p)}</p>
                  {p.home_city && <p className="text-muted truncate text-xs">{p.home_city}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        basePath="/players"
        page={pageNum}
        pageSize={PAGE_SIZE}
        total={total}
        searchParams={searchParams}
      />
    </div>
  );
}
