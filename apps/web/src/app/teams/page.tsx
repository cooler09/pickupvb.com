import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import { FORMAT_LABEL } from '@/lib/enum-labels';
import { Pagination } from '@/components/pagination';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: 'Tournament teams',
    description:
        'Browse, manage, and discover tournament volleyball teams on PickupVB. Build a roster, recruit players, and sign up for tournaments together.',
    alternates: { canonical: '/teams' },
};

const PAGE_SIZE = 24;
const FORMAT_OPTIONS = ['doubles', 'triples', 'quads', 'sixes'] as const;
type FormatOption = (typeof FORMAT_OPTIONS)[number];

type TeamRow = {
    id: string;
    name: string;
    format: string;
    captain_id: string;
};

type DiscoverRow = TeamRow & {
    captain: { display_name: string | null } | null;
};

export default async function TeamsIndexPage(props: {
    searchParams: Promise<{ q?: string; format?: string; page?: string }>;
}) {
    const searchParams = await props.searchParams;
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Parse discover filters (apply to public browse below).
    const q = (searchParams.q ?? '').trim();
    const format: FormatOption | undefined = FORMAT_OPTIONS.includes(
        searchParams.format as FormatOption,
    )
        ? (searchParams.format as FormatOption)
        : undefined;
    const pageNum = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
    const from = (pageNum - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Public "discover" query — runs for everyone, signed in or not.
    let discoverQuery = supabase
        .from('teams')
        .select(
            'id, name, format, captain_id, captain:profiles!teams_captain_id_fkey(display_name)',
            { count: 'exact' },
        )
        .order('name', { ascending: true })
        .range(from, to);
    if (q) {
        discoverQuery = discoverQuery.ilike(
            'name',
            `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`,
        );
    }
    if (format) discoverQuery = discoverQuery.eq('format', format);
    const { data: discoverData, count: discoverCount } = await discoverQuery;
    const discoverTeams = (discoverData as DiscoverRow[] | null) ?? [];
    const discoverTotal = discoverCount ?? discoverTeams.length;
    const hasFilter = q.length > 0 || !!format;

    // Viewer-specific sections only render when signed in.
    let captained: TeamRow[] = [];
    let onTeams: TeamRow[] = [];
    let pendingInvites: TeamRow[] = [];
    if (user) {
        const { data: captainedRows } = await supabase
            .from('teams')
            .select('id, name, format, captain_id')
            .eq('captain_id', user.id)
            .order('name', { ascending: true });
        captained = (captainedRows as TeamRow[] | null) ?? [];

        const { data: memberRows } = await supabase
            .from('team_members')
            .select('status, teams:teams!inner(id, name, format, captain_id)')
            .eq('user_id', user.id);
        type MemberRow = {
            status: 'active' | 'pending' | null;
            teams: TeamRow | null;
        };
        const allMemberships = ((memberRows as MemberRow[] | null) ?? []).filter(
            (r): r is MemberRow & { teams: TeamRow } =>
                !!r.teams && r.teams.captain_id !== user.id,
        );
        onTeams = allMemberships
            .filter((r) => (r.status ?? 'active') === 'active')
            .map((r) => r.teams);
        pendingInvites = allMemberships
            .filter((r) => r.status === 'pending')
            .map((r) => r.teams);
    }

    return (
        <div className="mx-auto max-w-3xl space-y-8 py-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Teams</h1>
                    <p className="text-sm text-muted">
                        Build a roster once, then sign up for tournaments together.
                    </p>
                </div>
                {user ? (
                    <Link
                        href="/teams/new"
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                    >
                        + New team
                    </Link>
                ) : (
                    <Link
                        href="/login?next=/teams"
                        className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                    >
                        Sign in to create a team
                    </Link>
                )}
            </header>

            {user && (
                <div className="space-y-6">
                    {pendingInvites.length > 0 && (
                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
                                Pending invites ({pendingInvites.length})
                            </h2>
                            <ul className="grid gap-3 sm:grid-cols-2">
                                {pendingInvites.map((t) => (
                                    <TeamCard key={t.id} team={t} role="pending" />
                                ))}
                            </ul>
                        </section>
                    )}

                    <section className="space-y-2">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                            Captained ({captained.length})
                        </h2>
                        {captained.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-border-base p-6 text-center text-sm text-muted">
                                You don&apos;t captain any teams yet.
                            </p>
                        ) : (
                            <ul className="grid gap-3 sm:grid-cols-2">
                                {captained.map((t) => (
                                    <TeamCard key={t.id} team={t} role="captain" />
                                ))}
                            </ul>
                        )}
                    </section>

                    {onTeams.length > 0 && (
                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                                Rostered on ({onTeams.length})
                            </h2>
                            <ul className="grid gap-3 sm:grid-cols-2">
                                {onTeams.map((t) => (
                                    <TeamCard key={t.id} team={t} role="member" />
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            )}

            <section className="space-y-3">
                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                        Discover teams
                    </h2>
                    <p className="text-xs text-muted">
                        Browse public tournament rosters across PickupVB.
                    </p>
                </div>
                <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <input
                        type="search"
                        name="q"
                        placeholder="Search by team name…"
                        defaultValue={q}
                        className="rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                    />
                    <select
                        name="format"
                        defaultValue={format ?? ''}
                        className="rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                        aria-label="Filter by format"
                    >
                        <option value="">Any format</option>
                        {FORMAT_OPTIONS.map((f) => (
                            <option key={f} value={f}>
                                {FORMAT_LABEL[f] ?? f}
                            </option>
                        ))}
                    </select>
                    <button
                        type="submit"
                        className="rounded-md border border-border-base px-3 py-2 text-sm hover:bg-fg/5"
                    >
                        Search
                    </button>
                </form>
                {discoverTeams.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border-base p-6 text-center text-sm text-muted">
                        {hasFilter ? 'No teams match those filters.' : 'No teams yet.'}
                    </p>
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {discoverTeams.map((t) => (
                            <TeamCard
                                key={t.id}
                                team={t}
                                role="public"
                                captainName={t.captain?.display_name ?? null}
                            />
                        ))}
                    </ul>
                )}
                <Pagination
                    basePath="/teams"
                    page={pageNum}
                    pageSize={PAGE_SIZE}
                    total={discoverTotal}
                    searchParams={searchParams}
                />
            </section>
        </div>
    );
}

function TeamCard({
    team,
    role,
    captainName,
}: {
    team: TeamRow;
    role: 'captain' | 'member' | 'pending' | 'public';
    captainName?: string | null;
}) {
    const badge =
        role === 'captain'
            ? { label: 'Captain', className: 'bg-primary/15 text-primary' }
            : role === 'pending'
                ? {
                    label: 'Pending',
                    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                }
                : role === 'member'
                    ? { label: 'Member', className: 'bg-fg/10 text-fg/80' }
                    : null;
    return (
        <li>
            <Link
                href={`/teams/${team.id}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-border-base bg-surface p-3 hover:border-primary/40"
            >
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{team.name}</p>
                    <p className="text-xs text-muted">
                        {FORMAT_LABEL[team.format] ?? team.format}
                        {captainName ? ` · Captain: ${captainName}` : ''}
                    </p>
                </div>
                {badge && (
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                        {badge.label}
                    </span>
                )}
            </Link>
        </li>
    );
}
