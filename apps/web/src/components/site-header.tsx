import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import type { Theme } from '@/lib/theme';
import { ThemeToggle } from './theme-toggle';
import { MobileMenu } from './mobile-menu';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
}

export default async function SiteHeader({ theme }: { theme: Theme }) {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const isAnon = Boolean(user && (user as { is_anonymous?: boolean }).is_anonymous);
    const isRealUser = Boolean(user) && !isAnon;

    // Pull the display name to label the avatar / nav link. Falls back to the
    // email local-part (or 'Player') if the profile row is missing.
    let displayName: string | null = null;
    if (isRealUser && user) {
        const { data: row } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .maybeSingle();
        const fromProfile = (row as { display_name: string | null } | null)?.display_name;
        displayName =
            fromProfile?.trim() ||
            user.email?.split('@')[0] ||
            'Player';
    }

    const userInfo = isRealUser && user && displayName
        ? { displayName, initials: initialsOf(displayName) }
        : null;

    // Count pending team invites so we can show a badge on the Teams link.
    // Anonymous users can't be invited, so skip the query for them.
    let pendingTeamInvites = 0;
    if (isRealUser && user) {
        const { count } = await supabase
            .from('team_members')
            .select('team_id', { head: true, count: 'exact' })
            .eq('user_id', user.id)
            .eq('status', 'pending');
        pendingTeamInvites = count ?? 0;
    }

    return (
        <header className="border-b border-border-base bg-surface">
            <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
                <Link href="/" className="text-xl font-bold text-primary">
                    PickupVB
                </Link>

                {/* Desktop nav */}
                <ul className="hidden items-center gap-4 text-sm md:flex">
                    <li>
                        <Link href="/events" className="hover:text-primary">
                            Find events
                        </Link>
                    </li>
                    <li>
                        <Link href="/events/new" className="hover:text-primary">
                            Host an event
                        </Link>
                    </li>
                    <li>
                        <Link href="/groups" className="hover:text-primary">
                            Groups
                        </Link>
                    </li>
                    <li>
                        <Link href="/players" className="hover:text-primary">
                            Players
                        </Link>
                    </li>
                    {userInfo && (
                        <li>
                            <Link
                                href="/teams"
                                className="inline-flex items-center gap-1.5 hover:text-primary"
                            >
                                Teams
                                {pendingTeamInvites > 0 && (
                                    <span
                                        aria-label={`${pendingTeamInvites} pending team invite${pendingTeamInvites === 1 ? '' : 's'}`}
                                        className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                                    >
                                        {pendingTeamInvites}
                                    </span>
                                )}
                            </Link>
                        </li>
                    )}
                    <li>
                        <Link href="/tools" className="hover:text-primary">
                            Host tools
                        </Link>
                    </li>
                    <li>
                        <ThemeToggle current={theme} />
                    </li>
                    {userInfo ? (
                        <li className="flex items-center gap-3">
                            <Link
                                href="/profile"
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary hover:bg-primary/25"
                                title={userInfo.displayName}
                                aria-label={`Your profile (${userInfo.displayName})`}
                            >
                                {userInfo.initials}
                            </Link>
                            <Link
                                href="/profile"
                                className="hidden max-w-[12rem] truncate text-fg/70 hover:text-primary lg:inline"
                            >
                                {userInfo.displayName}
                            </Link>
                            <form action={signOut}>
                                <button
                                    type="submit"
                                    className="rounded-md border border-border-base px-3 py-1.5 hover:bg-fg/5"
                                >
                                    Sign out
                                </button>
                            </form>
                        </li>
                    ) : (
                        <>
                            {isAnon && (
                                <li>
                                    <Link
                                        href="/claim"
                                        className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20"
                                    >
                                        Finish creating your account
                                    </Link>
                                </li>
                            )}
                            <li>
                                <Link href="/login" className="hover:text-primary">
                                    Sign in
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/login?mode=sign-up"
                                    className="rounded-md bg-primary px-3 py-1.5 text-white hover:bg-primary/90"
                                >
                                    Sign up
                                </Link>
                            </li>
                        </>
                    )}
                </ul>

                {/* Mobile nav */}
                <MobileMenu
                    theme={theme}
                    user={userInfo}
                    pendingTeamInvites={pendingTeamInvites}
                />
            </nav>
        </header>
    );
}
