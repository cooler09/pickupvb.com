import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: 'Players',
    description:
        'Discover volleyball players on PickupVB. Find people in your area, see who is signed up for events, and connect with teammates.',
    alternates: { canonical: '/players' },
};

type Row = {
    id: string;
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

export default async function PlayersIndexPage(
    props: {
        searchParams: Promise<{ q?: string; city?: string }>;
    }
) {
    const searchParams = await props.searchParams;
    const supabase = await getServerSupabase();
    const q = (searchParams.q ?? '').trim();
    const city = (searchParams.city ?? '').trim();

    let query = supabase
        .from('profiles')
        .select('id, display_name, first_name, last_name, home_city, avatar_url')
        .order('display_name', { ascending: true })
        .limit(60);

    if (q) {
        const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
        query = query.or(
            `display_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`,
        );
    }
    if (city) {
        query = query.ilike('home_city', `%${city.replace(/[%_]/g, (m) => `\\${m}`)}%`);
    }

    const { data } = await query;
    const players = (data as Row[] | null) ?? [];
    const hasFilter = q.length > 0 || city.length > 0;

    return (
        <div className="mx-auto max-w-4xl space-y-6 py-4">
            <header>
                <h1 className="text-2xl font-bold">Players</h1>
                <p className="text-sm text-muted">
                    Find people to follow, add to your team, or invite to a group.
                </p>
            </header>
            <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                    type="search"
                    name="q"
                    placeholder="Search by name…"
                    defaultValue={q}
                    className="rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                />
                <input
                    type="search"
                    name="city"
                    placeholder="Home city"
                    defaultValue={city}
                    className="rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                />
                <button
                    type="submit"
                    className="rounded-md border border-border-base px-3 py-2 text-sm hover:bg-fg/5"
                >
                    Search
                </button>
            </form>
            {players.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border-base p-6 text-center text-sm text-muted">
                    {hasFilter
                        ? 'No players match those filters.'
                        : 'No players yet — be the first to sign up.'}
                </p>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {players.map((p) => (
                        <li key={p.id}>
                            <Link
                                href={`/players/${p.id}`}
                                className="flex items-center gap-3 rounded-lg border border-border-base bg-surface p-3 hover:border-primary/40"
                            >
                                {p.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    (<img
                                        src={p.avatar_url}
                                        alt=""
                                        className="h-10 w-10 rounded-full object-cover"
                                    />)
                                ) : (
                                    <span
                                        aria-hidden="true"
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
                                    >
                                        {initialsOf(p)}
                                    </span>
                                )}
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{nameOf(p)}</p>
                                    {p.home_city && (
                                        <p className="truncate text-xs text-muted">{p.home_city}</p>
                                    )}
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
