import Link from 'next/link';
import { getCurrentUser } from '@/lib/server-auth';
import type { Theme } from '@/lib/theme';
import { ThemeToggle } from './theme-toggle';
import { MobileMenu } from './mobile-menu';
import { NotificationBell } from './notification-bell';
import { signOut } from './actions';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
}

export default async function SiteHeader({ theme }: { theme: Theme }) {
  const { supabase, user } = await getCurrentUser();

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
    displayName = fromProfile?.trim() || user.email?.split('@')[0] || 'Player';
  }

  const userInfo =
    isRealUser && user && displayName ? { displayName, initials: initialsOf(displayName) } : null;

  // Count pending team invites so we can show a badge on the Teams link.
  // Anonymous users can't be invited, so skip the query for them.
  let pendingTeamInvites = 0;
  let notifUnread = 0;
  let notifItems: Array<{
    id: string;
    kind: string;
    title: string;
    body: string | null;
    href: string | null;
    read_at: string | null;
    created_at: string;
  }> = [];
  if (isRealUser && user) {
    const [{ count }, unreadCount, recent] = await Promise.all([
      supabase
        .from('team_members')
        .select('team_id', { head: true, count: 'exact' })
        .eq('user_id', user.id)
        .eq('status', 'pending'),
      supabase
        .from('notifications')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', user.id)
        .is('read_at', null),
      supabase
        .from('notifications')
        .select('id, kind, title, body, href, read_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);
    pendingTeamInvites = count ?? 0;
    notifUnread = unreadCount.count ?? 0;
    notifItems = (recent.data as typeof notifItems | null) ?? [];
  }

  return (
    <header className="border-border-base bg-surface border-b">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-primary text-xl font-bold">
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
            <Link href="/community" className="hover:text-primary">
              Community
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
              <Link href="/teams" className="hover:text-primary inline-flex items-center gap-1.5">
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
            <Link href="/pricing" className="hover:text-primary">
              Pricing
            </Link>
          </li>
          <li>
            <ThemeToggle current={theme} />
          </li>
          {userInfo ? (
            <li className="flex items-center gap-3">
              {user && (
                <NotificationBell
                  userId={user.id}
                  initialUnreadCount={notifUnread}
                  initialItems={notifItems}
                />
              )}
              <Link
                href="/profile"
                className="bg-primary/15 text-primary hover:bg-primary/25 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                title={userInfo.displayName}
                aria-label={`Your profile (${userInfo.displayName})`}
              >
                {userInfo.initials}
              </Link>
              <Link
                href="/profile"
                className="text-fg/70 hover:text-primary hidden max-w-[12rem] truncate lg:inline"
              >
                {userInfo.displayName}
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5"
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
                    className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 rounded-md border px-3 py-1.5 text-sm font-medium"
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
                  className="bg-primary hover:bg-primary/90 rounded-md px-3 py-1.5 text-white"
                >
                  Sign up
                </Link>
              </li>
            </>
          )}
        </ul>

        {/* Mobile nav */}
        <div className="flex items-center gap-2 md:hidden">
          {user && (
            <NotificationBell
              userId={user.id}
              initialUnreadCount={notifUnread}
              initialItems={notifItems}
            />
          )}
          <MobileMenu theme={theme} user={userInfo} pendingTeamInvites={pendingTeamInvites} />
        </div>
      </nav>
    </header>
  );
}
