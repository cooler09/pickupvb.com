import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { hasProBenefits } from '@/lib/admin';
import {
  listOwnMembershipPlans,
  hostMembershipStats,
  type MembershipPlan,
} from '@/lib/memberships';
import { renderNowMs } from '@/lib/render-now';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import { SubmitButton } from '@/components/submit-button';
import { Alert } from '@/components/alert';
import { fieldInputClass, fieldLabelClass } from '@/components/field-styles';
import {
  createMembershipPlanFromForm,
  archiveMembershipPlan,
  reactivateMembershipPlan,
} from './actions';

// Dynamic via `getServerSupabase()` (reads cookies); no `force-dynamic` needed.
export const metadata = {
  title: 'Memberships — PickupVB',
  robots: { index: false, follow: false },
};

const MANAGE_PATH = '/profile/billing/memberships';

function usd(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

type SearchParams = Promise<{ membership?: string; membership_msg?: string }>;

function PageHeader() {
  return (
    <header className="space-y-1">
      <h1 className="text-headline-lg font-bold">Memberships</h1>
      <p className="text-muted text-sm">
        Sell a monthly membership. While it&apos;s active, members sign up free to any of your
        open-play events that accept passes — recurring revenue, no per-session collection.
      </p>
    </header>
  );
}

export default async function HostMembershipsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/profile/billing/memberships');

  const entitled = await hasProBenefits(user.id);
  const { membership: flash, membership_msg: flashMsg } = await searchParams;

  if (!entitled) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-4">
        <PageHeader />
        <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-4 border p-5 sm:p-6">
          <h2 className="text-fg text-lg font-semibold">Pro feature</h2>
          <p className="text-muted text-sm">
            Selling memberships is included with Pro. Upgrade to offer your regulars a monthly
            membership and collect recurring revenue.
          </p>
          <Link href={'/profile/billing/pro' as Route} className={primaryButtonClass('md')}>
            Upgrade to Pro →
          </Link>
        </section>
      </div>
    );
  }

  const now = renderNowMs();
  const [plans, stats] = await Promise.all([
    listOwnMembershipPlans(user.id),
    hostMembershipStats(user.id, now),
  ]);

  const active = plans.filter((p) => p.status === 'active');
  const archived = plans.filter((p) => p.status === 'archived');

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <PageHeader />

      {flash === 'saved' && <Alert variant="success">Membership plan created.</Alert>}
      {flash === 'archived' && (
        <Alert variant="success">
          Plan archived — it&apos;s no longer for sale. Existing members keep their subscription.
        </Alert>
      )}
      {flash === 'reactivated' && <Alert variant="success">Plan is back on sale.</Alert>}
      {flash === 'pro' && (
        <Alert variant="warning" title="Pro required">
          Selling memberships is a Pro feature.
        </Alert>
      )}
      {(flash === 'invalid' || flash === 'error') && (
        <Alert variant="error" title="Couldn’t save">
          {flashMsg || 'Please check the form and try again.'}
        </Alert>
      )}

      {/* ── Stats ───────────────────────────────────────────── */}
      <section className="border-border-base bg-md-surface-container rounded-shape-sm grid grid-cols-2 gap-4 border p-5">
        <div>
          <p className="text-muted text-xs tracking-wide uppercase">Active members</p>
          <p className="text-fg text-headline-sm font-bold">{stats.activeMembers}</p>
        </div>
        <div>
          <p className="text-muted text-xs tracking-wide uppercase">Monthly gross</p>
          <p className="text-fg text-headline-sm font-bold">{usd(stats.monthlyGrossCents)}</p>
        </div>
        <p className="text-muted col-span-2 text-xs">
          Gross before PickupVB&apos;s platform fee and Stripe&apos;s processing fee, which are
          deducted from your payout the same as a ticket sale.
        </p>
      </section>

      {/* ── Create a plan ───────────────────────────────────── */}
      <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-4 border p-5 sm:p-6">
        <h2 className="text-fg text-lg font-semibold">Create a membership plan</h2>
        <form action={createMembershipPlanFromForm.bind(null, MANAGE_PATH)} className="space-y-4">
          <div>
            <label htmlFor="title" className={fieldLabelClass}>
              Title
            </label>
            <input
              id="title"
              name="title"
              required
              maxLength={80}
              placeholder="Open-play membership"
              className={fieldInputClass}
            />
          </div>
          <div>
            <label htmlFor="description" className={fieldLabelClass}>
              Description <span className="text-muted font-normal">(optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              maxLength={280}
              rows={2}
              placeholder="Unlimited Tuesday/Thursday open play while active."
              className={fieldInputClass}
            />
          </div>
          <div className="max-w-[12rem]">
            <label htmlFor="price_usd" className={fieldLabelClass}>
              Price (USD / month)
            </label>
            <input
              id="price_usd"
              name="price_usd"
              type="number"
              min={1}
              step="0.01"
              required
              placeholder="40.00"
              className={fieldInputClass}
            />
          </div>
          <SubmitButton className={primaryButtonClass('md')} pendingChildren="Creating…">
            Create plan
          </SubmitButton>
        </form>
      </section>

      {/* ── Your plans ──────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-fg text-lg font-semibold">Your plans</h2>
        {plans.length === 0 ? (
          <p className="text-muted text-sm">No plans yet. Create one above to start selling.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((p) => (
              <PlanRow key={p.id} plan={p} />
            ))}
            {archived.map((p) => (
              <PlanRow key={p.id} plan={p} />
            ))}
          </ul>
        )}
        <p className="text-muted text-xs">
          To let an event accept memberships, open the event&apos;s Edit page and turn on “Accept
          pass credits” (the same toggle covers passes and memberships).
        </p>
      </section>
    </div>
  );
}

function PlanRow({ plan }: { plan: MembershipPlan }) {
  const archived = plan.status === 'archived';
  return (
    <li className="border-border-base bg-md-surface-container flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
      <div className="min-w-0">
        <p className="text-fg font-medium">
          {plan.title}
          {archived && (
            <span className="bg-fg/10 text-muted ml-2 rounded-full px-2 py-0.5 text-xs">
              Archived
            </span>
          )}
        </p>
        <p className="text-muted text-sm">{usd(plan.priceCents)} / month</p>
      </div>
      {archived ? (
        <form action={reactivateMembershipPlan.bind(null, plan.id)}>
          <SubmitButton className={neutralButtonClass('sm')} pendingChildren="…">
            Reactivate
          </SubmitButton>
        </form>
      ) : (
        <form action={archiveMembershipPlan.bind(null, plan.id)}>
          <SubmitButton className={neutralButtonClass('sm')} pendingChildren="…">
            Archive
          </SubmitButton>
        </form>
      )}
    </li>
  );
}
