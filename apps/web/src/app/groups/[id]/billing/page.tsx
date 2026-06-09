import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { isStripeConfigured } from '@/lib/stripe';
import { CLUB_MONTHLY_PRICE_CENTS, isClubGroup, getGroupSubscription } from '@/lib/club';
import { getGroupStripeAccountStatus } from '@/lib/group-stripe-account';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import { SubmitButton } from '@/components/submit-button';
import { OpenInNewTabButton } from '@/components/open-in-new-tab-button';
import { Alert } from '@/components/alert';
import {
  startClubCheckout,
  getClubBillingPortalUrl,
  startGroupStripeOnboarding,
  refreshGroupStripeAccountStatus,
  getGroupStripeDashboardUrl,
} from './actions';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Club & payouts — PickupVB',
  robots: { index: false, follow: false },
};

function usd(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

type SearchParams = Promise<{ club?: string; onboarding?: string }>;

export default async function GroupBillingPage(props: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  // The route segment is the group SLUG (like the rest of /groups/[id]).
  const { id: slug } = await props.params;
  const { club: flash, onboarding } = await props.searchParams;

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/groups/${slug}/billing`);

  const { data: groupRow } = await supabase
    .from('groups')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle();
  if (!groupRow) notFound();
  const group = groupRow as { id: string; name: string };
  const groupId = group.id;
  const groupName = group.name;

  // Owner/admin gate.
  const { data: roleRow } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle();
  const role = (roleRow as { role: string } | null)?.role;
  if (role !== 'owner' && role !== 'admin') redirect(`/groups/${slug}`);

  const stripeReady = isStripeConfigured();
  const [club, sub, acct] = await Promise.all([
    isClubGroup(groupId),
    getGroupSubscription(groupId),
    getGroupStripeAccountStatus(groupId),
  ]);

  return (
    <section className="mx-auto max-w-2xl space-y-6 py-4">
      <header className="space-y-1">
        <h1 className="text-headline-lg font-bold">Club &amp; payouts</h1>
        <p className="text-muted text-sm">
          For <span className="font-medium">{groupName}</span>. Subscribe to Club to collect event
          payments into one shared club account — no more nominating a treasurer.
        </p>
      </header>

      {!stripeReady && (
        <div className="border-border-base bg-md-surface-container rounded-shape-sm border p-4 text-sm">
          Payments are not configured on this server.
        </div>
      )}
      {flash === 'subscribed' && (
        <Alert variant="success">
          Club is being activated — it usually shows active within a few seconds.
        </Alert>
      )}
      {flash === 'needs_club' && (
        <Alert variant="warning" title="Club required">
          Subscribe to Club first, then connect your payout account.
        </Alert>
      )}
      {flash === 'error' && <Alert variant="error">Something went wrong. Please try again.</Alert>}
      {onboarding === 'complete' && (
        <Alert variant="success">
          Thanks! Refresh status below to confirm your payout account.
        </Alert>
      )}

      {/* ── Club subscription ───────────────────────────────── */}
      <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-fg text-lg font-semibold">
            Club{' '}
            <span className="bg-fg/10 text-muted ml-1 rounded-full px-2 py-0.5 text-xs font-medium">
              {club ? (sub?.status ?? 'active') : 'inactive'}
            </span>
          </h2>
          <span className="text-muted text-sm">{usd(CLUB_MONTHLY_PRICE_CENTS)}/mo</span>
        </div>
        <p className="text-muted text-sm">
          Unlocks a group-owned Stripe payout account. Group-hosted events can opt to pay out to the
          club instead of an individual organizer.
        </p>
        {stripeReady &&
          (club ? (
            <>
              {sub?.current_period_end && (
                <p className="text-muted text-sm">
                  {sub.cancel_at_period_end ? 'Cancels' : 'Renews'} on{' '}
                  <strong>{new Date(sub.current_period_end).toLocaleDateString()}</strong>.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <OpenInNewTabButton
                  getUrl={getClubBillingPortalUrl.bind(null, slug)}
                  className={neutralButtonClass('md')}
                  nullMessage="No subscription to manage yet."
                >
                  Manage subscription ↗
                </OpenInNewTabButton>
                <Link
                  href={`/groups/${slug}/analytics` as Route}
                  className="text-primary text-sm font-medium hover:underline"
                >
                  View club analytics →
                </Link>
              </div>
            </>
          ) : (
            <form action={startClubCheckout.bind(null, slug)}>
              <SubmitButton className={primaryButtonClass('md')} pendingChildren="Starting…">
                Subscribe to Club — {usd(CLUB_MONTHLY_PRICE_CENTS)}/mo
              </SubmitButton>
            </form>
          ))}
      </section>

      {/* ── Group payout account ────────────────────────────── */}
      <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-5 sm:p-6">
        <h2 className="text-fg text-lg font-semibold">Payout account</h2>
        {!club ? (
          <p className="text-muted text-sm">Subscribe to Club to connect a group payout account.</p>
        ) : !acct ? (
          <>
            <p className="text-muted text-sm">
              Connect a Stripe account for the club to receive event payouts.
            </p>
            <form action={startGroupStripeOnboarding.bind(null, slug)}>
              <SubmitButton className={primaryButtonClass('md')} pendingChildren="Starting…">
                Connect Stripe
              </SubmitButton>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm">
              Status:{' '}
              <strong className="text-fg">
                {acct.chargesEnabled ? 'Connected & ready' : 'Onboarding incomplete'}
              </strong>
            </p>
            <div className="flex flex-wrap gap-2">
              {!acct.chargesEnabled && (
                <form action={startGroupStripeOnboarding.bind(null, slug)}>
                  <SubmitButton className={primaryButtonClass('sm')} pendingChildren="…">
                    Finish onboarding
                  </SubmitButton>
                </form>
              )}
              <OpenInNewTabButton
                getUrl={getGroupStripeDashboardUrl.bind(null, slug)}
                className={neutralButtonClass('sm')}
                nullMessage="Finish onboarding first."
              >
                Stripe dashboard ↗
              </OpenInNewTabButton>
              <form action={refreshGroupStripeAccountStatus.bind(null, slug)}>
                <SubmitButton className={neutralButtonClass('sm')} pendingChildren="…">
                  Refresh status
                </SubmitButton>
              </form>
            </div>
            <p className="text-muted text-xs">
              To route an event here, open its Edit page and turn on “Pay out to {groupName}”
              (before any tickets sell).
            </p>
          </>
        )}
      </section>
    </section>
  );
}
