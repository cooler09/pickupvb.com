import Image from 'next/image';
import Link from 'next/link';

export type MyGroup = {
    id: string;
    slug: string;
    name: string;
    avatarUrl: string | null;
    homeCity: string | null;
    role: 'owner' | 'admin' | 'member';
};

type Props = {
    groups: MyGroup[];
};

/**
 * "Groups" section on the user's own profile. Shows the groups the viewer
 * belongs to with their role badge, plus a "+ New group" affordance and a
 * graceful empty state pointing at the directory.
 */
export function MyGroupsSection({ groups }: Props) {
    return (
        <section className="space-y-4">
            <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-bold">
                    Groups{' '}
                    <span className="text-sm font-normal text-muted">({groups.length})</span>
                </h2>
                <Link
                    href="/groups/new"
                    className="text-sm font-medium text-primary hover:underline"
                >
                    + New group
                </Link>
            </div>
            {groups.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border-base p-4 text-sm text-muted">
                    You aren&apos;t a member of any groups yet.{' '}
                    <Link href="/groups" className="text-primary hover:underline">
                        Browse groups
                    </Link>{' '}
                    or create one.
                </p>
            ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                    {groups.map((g) => (
                        <li key={g.id}>
                            <Link
                                href={`/groups/${g.id}`}
                                className="flex items-center gap-3 rounded-lg border border-border-base bg-surface p-2 hover:border-primary/40"
                            >
                                {g.avatarUrl ? (
                                    <Image
                                        src={g.avatarUrl}
                                        alt=""
                                        width={36}
                                        height={36}
                                        className="h-9 w-9 rounded-md object-cover"
                                    />
                                ) : (
                                    <span
                                        aria-hidden="true"
                                        className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary"
                                    >
                                        {g.name.slice(0, 2).toUpperCase()}
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{g.name}</p>
                                    <p className="text-[10px] uppercase tracking-wide text-muted">
                                        {g.role}
                                    </p>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
