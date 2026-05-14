import { removeMemberFromForm } from '../../actions';

export type TeamRosterMember = {
    userId: string;
    status: 'active' | 'pending';
    profile: {
        displayName: string;
        firstName: string | null;
        lastName: string | null;
    } | null;
};

type Props = {
    teamId: string;
    member: TeamRosterMember;
    isCaptain: boolean;
    viewerIsCaptain: boolean;
    returnPath: string;
};

function memberName(m: TeamRosterMember): string {
    const p = m.profile;
    if (!p) return 'Player';
    const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
    return full || p.displayName || 'Player';
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

export function TeamMemberRow({
    teamId,
    member,
    isCaptain,
    viewerIsCaptain,
    returnPath,
}: Props) {
    const name = memberName(member);
    const canRemove = viewerIsCaptain && !isCaptain;
    const isPending = member.status === 'pending';
    return (
        <li className="flex items-center justify-between gap-3 rounded-md border border-border-base bg-surface p-3">
            <div className="flex min-w-0 items-center gap-3">
                <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isPending ? 'bg-fg/10 text-fg/60' : 'bg-primary/15 text-primary'
                        }`}
                >
                    {initials(name)}
                </span>
                <div className="min-w-0">
                    <p
                        className={`truncate text-sm font-medium ${isPending ? 'text-fg/70' : ''}`}
                    >
                        {name}
                    </p>
                    {isCaptain ? (
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                            Captain
                        </p>
                    ) : isPending ? (
                        <p className="text-xs font-medium uppercase tracking-wide text-muted">
                            Pending invite
                        </p>
                    ) : null}
                </div>
            </div>
            {canRemove && (
                <form
                    action={removeMemberFromForm.bind(null, teamId, member.userId, returnPath)}
                >
                    <button
                        type="submit"
                        className="text-xs font-medium text-red-600 hover:underline"
                    >
                        {isPending ? 'Cancel' : 'Remove'}
                    </button>
                </form>
            )}
        </li>
    );
}
