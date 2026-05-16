import Image from 'next/image';
import Link from 'next/link';
import { followGroup, unfollowGroup } from '@/app/groups/actions';
import { ShareLink } from '@/components/share-link';

type Props = {
    group: {
        id: string;
        slug: string;
        name: string;
        description: string;
        avatarUrl: string | null;
        homeCity: string | null;
        region: string | null;
    };
    /** Owner/admin: shows the Edit link. */
    canManage: boolean;
    /** Whether a viewer is signed in (controls follow vs sign-in CTA). */
    isSignedIn: boolean;
    isFollowing: boolean;
    /** Where to send the user after follow/unfollow (revalidates this path). */
    returnPath: string;
};

/**
 * Top-of-page header for a group profile: avatar, name/slug/location/desc on
 * the left, action column (Edit / Follow / Sign-in CTA) on the right.
 */
export function GroupHeader({
    group,
    canManage,
    isSignedIn,
    isFollowing,
    returnPath,
}: Props) {
    return (
        <header className="flex items-start gap-4">
            {group.avatarUrl ? (
                <Image
                    src={group.avatarUrl}
                    alt=""
                    width={80}
                    height={80}
                    className="h-20 w-20 rounded-lg object-cover"
                />
            ) : (
                <span
                    aria-hidden="true"
                    className="flex h-20 w-20 items-center justify-center rounded-lg bg-primary/15 text-xl font-semibold text-primary"
                >
                    {group.name.slice(0, 2).toUpperCase()}
                </span>
            )}
            <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-fg">{group.name}</h1>
                <p className="text-xs text-muted">@{group.slug}</p>
                {(group.homeCity || group.region) && (
                    <p className="mt-0.5 text-sm text-muted">
                        {[group.homeCity, group.region].filter(Boolean).join(', ')}
                    </p>
                )}
                {group.description && (
                    <p className="mt-2 text-sm text-fg/90">{group.description}</p>
                )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
                <ShareLink path={`/groups/${group.id}`} title={group.name} />
                {canManage && (
                    <Link
                        href={`/groups/${group.id}/edit`}
                        className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                    >
                        Edit
                    </Link>
                )}
                {isSignedIn ? (
                    isFollowing ? (
                        <form action={unfollowGroup.bind(null, group.id, returnPath)}>
                            <button
                                type="submit"
                                className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                            >
                                ✓ Following
                            </button>
                        </form>
                    ) : (
                        <form action={followGroup.bind(null, group.id, returnPath)}>
                            <button
                                type="submit"
                                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                            >
                                + Follow
                            </button>
                        </form>
                    )
                ) : (
                    <Link
                        href={`/login?next=${encodeURIComponent(returnPath)}`}
                        className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                    >
                        Sign in to follow
                    </Link>
                )}
            </div>
        </header>
    );
}
