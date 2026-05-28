import { getCurrentUser } from '@/lib/server-auth';
import { BottomNavBar } from './bottom-nav-bar';

/**
 * M3 navigation bar (Bundle 5 — closes P2 #11). Shown below the `md`
 * breakpoint as the primary mobile navigation surface; the desktop top
 * nav in `<SiteHeader>` continues to own `md+`. Resolves the viewer's
 * auth state on the server so the client bar can render the correct
 * fourth slot ("Profile" for signed-in users, "Sign in" otherwise)
 * without an auth-state flash on hydration.
 *
 * Secondary destinations (Community feed, Players, Host an event, Host
 * tools, Pricing, Theme, Sign out) continue to live in `<MobileMenu>` —
 * the hamburger is reserved for secondary destinations per M3 spec
 * once a bottom nav is present.
 */
export default async function BottomNav() {
  const { user } = await getCurrentUser();
  const isAnon = Boolean(user && (user as { is_anonymous?: boolean }).is_anonymous);
  const isAuthenticated = Boolean(user) && !isAnon;
  return <BottomNavBar isAuthenticated={isAuthenticated} />;
}
