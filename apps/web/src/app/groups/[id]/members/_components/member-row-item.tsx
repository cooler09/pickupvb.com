import Link from 'next/link';
import { changeGroupMemberRole, removeGroupMember } from '@/app/groups/actions';

export type MemberListItem = {
    userId: string;
    role: 'owner' | 'admin' | 'member';
    profile: {
        displayName: string;
        firstName: string | null;
        lastName: string | null;
    } | null;
};

function memberName(p: MemberListItem['profile']): string {
    if (!p) return 'Member';
    const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
    return full || p.displayName || 'Member';
}

type Props = {
    groupId: string;
    member: MemberListItem;
    /** True when the row is the viewer themselves — disables controls. */
    isSelf: boolean;
    /** True when the viewer is an owner — only owners can grant owner role. */
    viewerIsOwner: boolean;
    returnPath: string;
};

/**
 * One row in the manage-members list. Renders role-change buttons for every
 * role the member is not currently in (owner-grant gated to owner viewers)
 * plus a Remove button. Self rows show a "(you)" tag without controls.
 */
export function MemberRowItem({ groupId, member, isSelf, viewerIsOwner, returnPath }: Props) {
    return (
        <li className="flex items-center gap-3 rounded-lg border border-border-base bg-surface p-3">
            <Link
                href={`/players/${member.userId}`}
                className="flex-1 text-sm font-medium hover:text-primary"
            >
                {memberName(member.profile)}
            </Link>
            {isSelf ? (
                <span className="text-xs uppercase tracking-wide text-muted">
                    {member.role} (you)
                </span>
            ) : (
                <>
                    <span className="text-xs uppercase tracking-wide text-muted">{member.role}</span>
                    {member.role !== 'member' && (
                        <form
                            action={changeGroupMemberRole.bind(
                                null,
                                groupId,
                                member.userId,
                                'member',
                                returnPath,
                            )}
                        >
                            <button
                                type="submit"
                                className="rounded-md border border-border-base px-2 py-1 text-xs hover:bg-fg/5"
                            >
                                → Member
                            </button>
                        </form>
                    )}
                    {member.role !== 'admin' && (
                        <form
                            action={changeGroupMemberRole.bind(
                                null,
                                groupId,
                                member.userId,
                                'admin',
                                returnPath,
                            )}
                        >
                            <button
                                type="submit"
                                className="rounded-md border border-border-base px-2 py-1 text-xs hover:bg-fg/5"
                            >
                                → Admin
                            </button>
                        </form>
                    )}
                    {viewerIsOwner && member.role !== 'owner' && (
                        <form
                            action={changeGroupMemberRole.bind(
                                null,
                                groupId,
                                member.userId,
                                'owner',
                                returnPath,
                            )}
                        >
                            <button
                                type="submit"
                                className="rounded-md border border-border-base px-2 py-1 text-xs hover:bg-fg/5"
                            >
                                → Owner
                            </button>
                        </form>
                    )}
                    <form
                        action={removeGroupMember.bind(null, groupId, member.userId, returnPath)}
                    >
                        <button
                            type="submit"
                            className="rounded-md border border-border-base px-2 py-1 text-xs hover:bg-red-50 hover:text-red-700"
                        >
                            Remove
                        </button>
                    </form>
                </>
            )}
        </li>
    );
}
