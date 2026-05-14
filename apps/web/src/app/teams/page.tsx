import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import { FORMAT_LABEL } from '@/lib/enum-labels';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Teams — PickupVB' };

type TeamRow = {
    id: string;
    name: string;
    format: string;
    captain_id: string;
};

export default async function TeamsIndexPage() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 py-8 text-center">
                <h1 className="text-2xl font-bold">Teams</h1>
                <p className="text-sm text-muted">
                    <Link href="/login?next=/teams" className="text-primary underline">
                        Log in
                    </Link>{' '}
                    to manage tournament teams.
                </p>
            </div>
        );
    }

    // Teams the viewer captains.
    const { data: captainedRows } = await supabase
        .from('teams')
        .select('id, name, format, captain_id')
        .eq('captain_id', user.id)
        .order('name', { ascending: true });
    const captained = (captainedRows as TeamRow[] | null) ?? [];

    // Teams the viewer is rostered on. Split by status so pending invites get
    // their own "awaiting your response" section.
    const { data: memberRows } = await supabase
        .from('team_members')
        .select('status, teams:teams!inner(id, name, format, captain_id)')
        .eq('user_id', user.id);
    type MemberRow = { status: 'active' | 'pending' | null; teams: TeamRow | null };
    const allMemberships = ((memberRows as MemberRow[] | null) ?? []).filter(
        (r): r is MemberRow & { teams: TeamRow } => !!r.teams && r.teams.captain_id !== user.id,
    );
    const onTeams = allMemberships
        .filter((r) => (r.status ?? 'active') === 'active')
        .map((r) => r.teams);
    const pendingInvites = allMemberships
        .filter((r) => r.status === 'pending')
        .map((r) => r.teams);

    return (
        <div className="mx-auto max-w-3xl space-y-6 py-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Your teams</h1>
                    <p className="text-sm text-muted">
                        Build a roster once, then sign up for tournaments together.
                    </p>
                </div>
                <Link
                    href="/teams/new"
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                >
                    + New team
                </Link>
            </header>

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
    );
}

function TeamCard({
    team,
    role,
}: {
    team: TeamRow;
    role: 'captain' | 'member' | 'pending';
}) {
    const badge =
        role === 'captain'
            ? { label: 'Captain', className: 'bg-primary/15 text-primary' }
            : role === 'pending'
                ? { label: 'Pending', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
                : { label: 'Member', className: 'bg-fg/10 text-fg/80' };
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
                    </p>
                </div>
                <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                >
                    {badge.label}
                </span>
            </Link>
        </li>
    );
}
