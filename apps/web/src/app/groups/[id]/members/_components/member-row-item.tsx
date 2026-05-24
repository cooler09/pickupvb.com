import Link from 'next/link';
import { changeGroupMemberRole, removeGroupMember } from '@/app/groups/member-actions';
import { SubmitButton } from '@/components/submit-button';

export type MemberListItem = {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  profile: {
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    handle: string;
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
    <li className="border-border-base bg-surface flex items-center gap-3 rounded-lg border p-3">
      <Link
        href={`/players/${member.profile?.handle ?? member.userId}`}
        className="hover:text-primary flex-1 text-sm font-medium"
      >
        {memberName(member.profile)}
      </Link>
      {isSelf ? (
        <span className="text-muted text-xs tracking-wide uppercase">{member.role} (you)</span>
      ) : (
        <>
          <span className="text-muted text-xs tracking-wide uppercase">{member.role}</span>
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
              <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-2 py-1 text-xs disabled:opacity-50">
                → Member
              </SubmitButton>
            </form>
          )}
          {member.role !== 'admin' && (
            <form
              action={changeGroupMemberRole.bind(null, groupId, member.userId, 'admin', returnPath)}
            >
              <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-2 py-1 text-xs disabled:opacity-50">
                → Admin
              </SubmitButton>
            </form>
          )}
          {viewerIsOwner && member.role !== 'owner' && (
            <form
              action={changeGroupMemberRole.bind(null, groupId, member.userId, 'owner', returnPath)}
            >
              <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-2 py-1 text-xs disabled:opacity-50">
                → Owner
              </SubmitButton>
            </form>
          )}
          <form action={removeGroupMember.bind(null, groupId, member.userId, returnPath)}>
            <SubmitButton className="border-border-base rounded-md border px-2 py-1 text-xs hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
              Remove
            </SubmitButton>
          </form>
        </>
      )}
    </li>
  );
}
