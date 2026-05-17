import Image from 'next/image';
import Link from 'next/link';
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
 * Member roster grid for a group profile. Each tile links to the player
 * profile and shows the member's role badge. Owners/admins see a link to
 * the dedicated `/members` management page. Pages of 12 members at a
 * time via the `mpage` query param.
 */
export function MembersSection({ groupSlug, members, canManage, page, searchParams }: Props) {
    const total = members.length;
    const start = (page - 1) * MEMBERS_PER_PAGE;
    const visible = members.slice(start, start + MEMBERS_PER_PAGE);
    return (
        <section id="members" className="space-y-3">
            <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-fg">
                    Members{' '}
                    <span className="text-sm font-normal text-muted">({total})</span>
                </h2>
                {canManage && (
                    <Link
                        href={`/groups/${groupSlug}/members`}
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        Manage members
                    </Link>
                )}
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
                {visible.map((m) => {
                    const name = memberName(m.profile);
                    return (
                        <li key={m.userId}>
                            <Link
                                href={`/players/${m.profile?.handle ?? m.userId}`}
                                className="flex items-center gap-3 rounded-lg border border-border-base bg-surface p-2 hover:border-primary/40"
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
            <Pagination
                basePath={`/groups/${groupSlug}`}
                page={page}
                pageSize={MEMBERS_PER_PAGE}
                total={total}
                searchParams={searchParams}
                pageParam="mpage"
                scrollToId="members"
            />
        </section>
    );
}
