import Link from 'next/link';

export type GroupMember = {
    userId: string;
    role: 'owner' | 'admin' | 'member';
    profile: {
        displayName: string;
        firstName: string | null;
        lastName: string | null;
        avatarUrl: string | null;
    } | null;
};

function memberName(p: GroupMember['profile']): string {
    if (!p) return 'Member';
    const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
    return full || p.displayName || 'Member';
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

type Props = {
    groupId: string;
    members: GroupMember[];
    /** Owner/admin: shows the "Manage members" link. */
    canManage: boolean;
};

/**
 * Member roster grid for a group profile. Each tile links to the player
 * profile and shows the member's role badge. Owners/admins see a link to
 * the dedicated `/members` management page.
 */
export function MembersSection({ groupId, members, canManage }: Props) {
    return (
        <section className="space-y-3">
            <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-fg">
                    Members{' '}
                    <span className="text-sm font-normal text-muted">({members.length})</span>
                </h2>
                {canManage && (
                    <Link
                        href={`/groups/${groupId}/members`}
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        Manage members
                    </Link>
                )}
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
                {members.map((m) => {
                    const name = memberName(m.profile);
                    return (
                        <li key={m.userId}>
                            <Link
                                href={`/players/${m.userId}`}
                                className="flex items-center gap-3 rounded-lg border border-border-base bg-surface p-2 hover:border-primary/40"
                            >
                                {m.profile?.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={m.profile.avatarUrl}
                                        alt=""
                                        className="h-9 w-9 rounded-full object-cover"
                                    />
                                ) : (
                                    <span
                                        aria-hidden="true"
                                        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                                    >
                                        {initials(name)}
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{name}</p>
                                    <p className="text-[10px] uppercase tracking-wide text-muted">
                                        {m.role}
                                    </p>
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
