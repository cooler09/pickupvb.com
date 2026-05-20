import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { Pagination } from '@/components/pagination';

export type GroupMember = {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  profile: {
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    handle: string;
  } | null;
};

const MEMBERS_PER_PAGE = 12;

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

const ROLE_BADGE: Record<GroupMember['role'], string> = {
  owner: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  admin: 'bg-primary/10 text-primary',
  member: 'bg-fg/5 text-muted',
};

type Props = {
  groupSlug: string;
  members: GroupMember[];
  /** Owner/admin: shows the "Manage members" link. */
  canManage: boolean;
  /** 1-indexed current page for the `mpage` paginator. */
  page: number;
  /** Caller's full searchParams so pagination can preserve other params. */
  searchParams: Record<string, string | undefined>;
};

/**
 * Member roster for a group profile. Renders as a card section that
 * sits below the upcoming-events feed. Each tile links to the player's
 * profile and shows a role badge. Paginated 12 at a time via `mpage`.
 */
export function MembersSection({ groupSlug, members, canManage, page, searchParams }: Props) {
  const total = members.length;
  const start = (page - 1) * MEMBERS_PER_PAGE;
  const visible = members.slice(start, start + MEMBERS_PER_PAGE);
  return (
    <section
      id="members"
      className="border-border-base bg-surface space-y-4 rounded-lg border p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-fg text-lg font-semibold">
          Members{' '}
          <span className="text-muted text-sm font-normal">({total})</span>
        </h2>
        {canManage && (
          <Link
            href={`/groups/${groupSlug}/members` as Route}
            className="text-primary text-sm font-medium hover:underline"
          >
            Manage members →
          </Link>
        )}
      </div>
      {total === 0 ? (
        <p className="text-muted text-sm">No members yet.</p>
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {visible.map((m) => {
              const name = memberName(m.profile);
              return (
                <li key={m.userId}>
                  <Link
                    href={`/players/${m.profile?.handle ?? m.userId}` as Route}
                    className="hover:bg-fg/5 hover:border-border-base flex items-center gap-3 rounded-lg border border-transparent p-2"
                  >
                    {m.profile?.avatarUrl ? (
                      <Image
                        src={m.profile.avatarUrl}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="bg-primary/15 text-primary flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
                      >
                        {initials(name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-fg truncate text-sm font-medium">{name}</p>
                      <span
                        className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ${ROLE_BADGE[m.role]}`}
                      >
                        {m.role}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination
            basePath={`/groups/${groupSlug}`}
            page={page}
            pageSize={MEMBERS_PER_PAGE}
            total={total}
            searchParams={searchParams}
            pageParam="mpage"
            scrollToId="members"
          />
        </>
      )}
    </section>
  );
}
