import Image from 'next/image';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/server-auth';
import { Pagination } from '@/components/pagination';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Groups — PickupVB' };

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

export default async function GroupsIndexPage(
    props: {
        searchParams: Promise<{ q?: string; page?: string }>;
    }
) {
    const searchParams = await props.searchParams;
    const supabase = await getServerSupabase();
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

    const { user } = await getCurrentUser();

    return (
        <div className="mx-auto max-w-3xl space-y-6 py-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Groups & organizations</h1>
                    <p className="text-sm text-muted">Clubs, leagues, and crews that host events.</p>
                </div>
                {user && (
                    <Link
                        href="/groups/new"
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                    >
                        + New group
                    </Link>
                )}
            </header>
            <form className="flex gap-2">
                <input
                    type="search"
                    name="q"
                    placeholder="Search by name, slug, or city…"
                    defaultValue={q}
                    className="flex-1 rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                />
                <button
                    type="submit"
                    className="rounded-md border border-border-base px-3 py-2 text-sm hover:bg-fg/5"
                >
                    Search
                </button>
            </form>
            {groups.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border-base p-6 text-center text-sm text-muted">
                    {q ? 'No groups match your search.' : 'No groups yet — be the first to create one.'}
                </p>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {groups.map((g) => (
                        <li key={g.id}>
                            <Link
                                href={`/groups/${g.slug}`}
                                className="flex items-start gap-3 rounded-lg border border-border-base bg-surface p-3 hover:border-primary/40"
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
                                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/15 text-sm font-semibold text-primary"
                                    >
                                        {g.name.slice(0, 2).toUpperCase()}
                                    </span>
                                )}
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{g.name}</p>
                                    {g.home_city && (
                                        <p className="truncate text-xs text-muted">
                                            {g.home_city}
                                            {g.region ? `, ${g.region}` : ''}
                                        </p>
                                    )}
                                    {g.description && (
                                        <p className="mt-1 line-clamp-2 text-xs text-fg/80">{g.description}</p>
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
