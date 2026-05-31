import Link from 'next/link';
import { primaryButtonClass } from '@/components/primary-button';
import { getCurrentUser } from '@/lib/server-auth';
import type { ThemePreference } from '@/lib/theme';
import { SubmitButton } from '@/components/submit-button';
import { ThemeToggle } from './theme-toggle';
import { MobileMenu } from './mobile-menu';
import { NavDropdown, type NavDropdownItem } from './nav-dropdown';
import { NotificationBell } from './notification-bell';
import { MessagesNavLink } from './messages-nav-link';
import { signOut } from './actions';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
}

export default async function SiteHeader({ theme }: { theme: ThemePreference }) {
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
  let messagesUnread = 0;
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
    const [{ count }, unreadCount, recent, msgUnread] = await Promise.all([
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
      // Unread conversation count for the Messages badge (ADR 0028, Phase 2) —
      // RLS-scoped SECURITY INVOKER RPC on the user-scoped client.
      supabase.rpc('count_unread_conversations'),
    ]);
    pendingTeamInvites = count ?? 0;
    notifUnread = unreadCount.count ?? 0;
    notifItems = (recent.data as typeof notifItems | null) ?? [];
    messagesUnread = (msgUnread.data as number | null) ?? 0;
  }

  return (
    <header className="border-border-base bg-surface border-b">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-primary text-xl font-bold">
          PickupVB
        </Link>

        {/* Desktop nav — top-level links plus grouped dropdowns so every
            destination from the mobile drawer stays reachable without
            crowding the bar. Secondary actions (theme, notifications,
            profile, sign out) live in the right-side cluster. */}
        <ul className="hidden items-center gap-5 text-sm md:flex">
          <li>
            <Link href="/events" className="hover:text-primary">
              Find events
            </Link>
          </li>
          <li>
            <NavDropdown
              label="Community"
              hasIndicator={pendingTeamInvites > 0}
              indicatorLabel={`${pendingTeamInvites} pending team invite${pendingTeamInvites === 1 ? '' : 's'}`}
              items={[
                { href: '/community', label: 'Community feed' },
                { href: '/groups', label: 'Groups' },
                { href: '/players', label: 'Players' },
                ...(userInfo
                  ? ([
                      {
                        href: '/teams',
                        label: 'Teams',
                        badge:
                          pendingTeamInvites > 0 ? (
                            <span
                              aria-label={`${pendingTeamInvites} pending team invite${pendingTeamInvites === 1 ? '' : 's'}`}
                              className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                            >
                              {pendingTeamInvites}
                            </span>
                          ) : null,
                      },
                    ] satisfies NavDropdownItem[])
                  : []),
              ]}
            />
          </li>
          <li>
            <NavDropdown
              label="Host"
              items={[
                { href: '/events/new', label: 'Host an event' },
                { href: '/tools', label: 'Host tools' },
              ]}
            />
          </li>
          <li>
            <Link href="/pricing" className="hover:text-primary">
              Pricing
            </Link>
          </li>
        </ul>

        {/* Desktop right-side cluster — utilities + identity. */}
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle current={theme} />
          {userInfo ? (
            <>
              <MessagesNavLink unread={messagesUnread} />
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
              <form action={signOut}>
                <SubmitButton className="text-fg/70 hover:text-primary rounded-md px-2 py-1.5 text-sm disabled:opacity-50">
                  Sign out
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              {isAnon && (
                <Link
                  href="/claim"
                  className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 rounded-md border px-3 py-1.5 text-sm font-medium"
                >
                  Finish creating your account
                </Link>
              )}
              <Link href="/login" className="hover:text-primary text-sm">
                Sign in
              </Link>
              <Link href="/login?mode=sign-up" className={primaryButtonClass('sm')}>
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile nav */}
        <div className="flex items-center gap-2 md:hidden">
          {userInfo && <MessagesNavLink unread={messagesUnread} />}
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
