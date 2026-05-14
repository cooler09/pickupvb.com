import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { FORMAT_LABEL } from '@/lib/enum-labels';
import { AddTeamMemberForm } from './_components/add-team-member-form';
import { TeamMemberRow, type TeamRosterMember } from './_components/team-member-row';
import { InviteResponse } from './_components/invite-response';

export const dynamic = 'force-dynamic';

type TeamRow = {
    id: string;
    name: string;
    format: string;
    captain_id: string;
};

type MemberRow = {
    user_id: string;
    status: 'active' | 'pending' | null;
    profiles: {
        display_name: string;
        first_name: string | null;
        last_name: string | null;
    } | null;
};

export default async function TeamDetailPage({
    params,
}: {
    params: { id: string };
}) {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/login?next=/teams/${params.id}`);

    const { data: teamData } = await supabase
        .from('teams')
        .select('id, name, format, captain_id')
        .eq('id', params.id)
        .maybeSingle();
    const team = teamData as TeamRow | null;
    if (!team) notFound();

    const isCaptain = team.captain_id === user.id;

    const { data: memberRows } = await supabase
        .from('team_members')
        .select(
            'user_id, status, profiles:profiles!inner(display_name, first_name, last_name)',
        )
        .eq('team_id', team.id);
    const rows = (memberRows as MemberRow[] | null) ?? [];
    const members: TeamRosterMember[] = rows.map((m) => ({
        userId: m.user_id,
        status: m.status ?? 'active',
        profile: m.profiles
            ? {
                displayName: m.profiles.display_name,
                firstName: m.profiles.first_name,
                lastName: m.profiles.last_name,
            }
            : null,
    }));

    // Captain on top, then active alpha, then pending alpha at the bottom.
    members.sort((a, b) => {
        if (a.userId === team.captain_id) return -1;
        if (b.userId === team.captain_id) return 1;
        if (a.status !== b.status) return a.status === 'pending' ? 1 : -1;
        return (a.profile?.displayName ?? '').localeCompare(b.profile?.displayName ?? '');
    });

    const activeCount = members.filter((m) => m.status === 'active').length;
    const pendingCount = members.length - activeCount;
    const viewerMember = members.find((m) => m.userId === user.id);
    const viewerHasPendingInvite = viewerMember?.status === 'pending';

    const returnPath = `/teams/${team.id}`;

    return (
        <div className="mx-auto max-w-2xl space-y-6 py-4">
            <header className="space-y-1">
                <Link href="/teams" className="text-sm text-primary hover:underline">
                    ← Back to teams
                </Link>
                <h1 className="text-2xl font-bold">{team.name}</h1>
                <p className="text-sm text-muted">
                    {FORMAT_LABEL[team.format] ?? team.format} · {activeCount} player
                    {activeCount === 1 ? '' : 's'}
                    {pendingCount > 0 && ` · ${pendingCount} pending`}
                </p>
            </header>

            {viewerHasPendingInvite && (
                <InviteResponse teamId={team.id} returnPath={returnPath} teamName={team.name} />
            )}

            {isCaptain && (
                <AddTeamMemberForm
                    teamId={team.id}
                    returnPath={returnPath}
                    existingMemberIds={members.map((m) => m.userId)}
                />
            )}

            <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Roster
                </h2>
                <ul className="space-y-2">
                    {members.map((m) => (
                        <TeamMemberRow
                            key={m.userId}
                            teamId={team.id}
                            member={m}
                            isCaptain={m.userId === team.captain_id}
                            viewerIsCaptain={isCaptain}
                            returnPath={returnPath}
                        />
                    ))}
                </ul>
            </section>
        </div>
    );
}
