import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { hasProBenefits } from '@/lib/admin';
import { listOwnHostPasses, hostPassRevenue, type HostPass } from '@/lib/passes';
import { perSessionCents } from '@/lib/pass-helpers';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import { SubmitButton } from '@/components/submit-button';
import { Alert } from '@/components/alert';
import { fieldInputClass, fieldLabelClass, fieldHintClass } from '@/components/field-styles';
import { createPassFromForm, archivePass, reactivatePass } from './actions';

// Dynamic via `getServerSupabase()` (reads cookies); no `force-dynamic` needed.
export const metadata = {
  title: 'Season passes — PickupVB',
  robots: { index: false, follow: false },
};

const MANAGE_PATH = '/profile/billing/passes';

function usd(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

type SearchParams = Promise<{ pass?: string; pass_msg?: string }>;

function PageHeader() {
  return (
    <header className="space-y-1">
      <h1 className="text-headline-lg font-bold">Season passes</h1>
      <p className="text-muted text-sm">
        Sell a prepaid pack of credits attendees redeem to sign up for your open-play events — one
        payment instead of paying every session.
      </p>
    </header>
  );
}

export default async function HostPassesPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/profile/billing/passes');

  const entitled = await hasProBenefits(user.id);
  const { pass: flash, pass_msg: flashMsg } = await searchParams;

  if (!entitled) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-4">
        <PageHeader />
        <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-4 border p-5 sm:p-6">
          <h2 className="text-fg text-lg font-semibold">Pro feature</h2>
          <p className="text-muted text-sm">
            Selling season passes is included with Pro. Upgrade to offer your regulars a prepaid
            multi-session pass and collect committed revenue up front.
          </p>
          <Link href={'/profile/billing/pro' as Route} className={primaryButtonClass('md')}>
            Upgrade to Pro →
          </Link>
        </section>
      </div>
    );
  }

  const [passes, revenue] = await Promise.all([
    listOwnHostPasses(user.id),
    hostPassRevenue(user.id),
  ]);

  const active = passes.filter((p) => p.status === 'active');
  const archived = passes.filter((p) => p.status === 'archived');

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <PageHeader />

      {flash === 'saved' && <Alert variant="success">Pass created.</Alert>}
      {flash === 'archived' && (
        <Alert variant="success">
          Pass archived — it&apos;s no longer for sale. Already-sold credits still work.
        </Alert>
      )}
      {flash === 'reactivated' && <Alert variant="success">Pass is back on sale.</Alert>}
      {flash === 'pro' && (
        <Alert variant="warning" title="Pro required">
          Selling passes is a Pro feature.
        </Alert>
      )}
      {(flash === 'invalid' || flash === 'error') && (
        <Alert variant="error" title="Couldn’t save">
          {flashMsg || 'Please check the form and try again.'}
        </Alert>
      )}

      {/* ── Revenue summary ─────────────────────────────────── */}
      <section className="border-border-base bg-md-surface-container rounded-shape-sm grid grid-cols-2 gap-4 border p-5">
        <div>
          <p className="text-muted text-xs tracking-wide uppercase">Passes sold</p>
          <p className="text-fg text-headline-sm font-bold">{revenue.count}</p>
        </div>
        <div>
          <p className="text-muted text-xs tracking-wide uppercase">Gross collected</p>
          <p className="text-fg text-headline-sm font-bold">{usd(revenue.grossCents)}</p>
        </div>
        <p className="text-muted col-span-2 text-xs">
          Gross before PickupVB&apos;s platform fee and Stripe&apos;s processing fee, which are
          deducted from your payout the same as a ticket sale.
        </p>
      </section>

      {/* ── Create a pass ───────────────────────────────────── */}
      <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-4 border p-5 sm:p-6">
        <h2 className="text-fg text-lg font-semibold">Create a pass</h2>
        <form action={createPassFromForm.bind(null, MANAGE_PATH)} className="space-y-4">
          <div>
            <label htmlFor="title" className={fieldLabelClass}>
              Title
            </label>
            <input
              id="title"
              name="title"
              required
              maxLength={80}
              placeholder="10-session open-play pass"
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
              placeholder="Good for any Tuesday/Thursday open play this season."
              className={fieldInputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="credit_count" className={fieldLabelClass}>
                Sessions (credits)
              </label>
              <input
                id="credit_count"
                name="credit_count"
                type="number"
                min={1}
                max={100}
                required
                defaultValue={10}
                className={fieldInputClass}
              />
            </div>
            <div>
              <label htmlFor="price_usd" className={fieldLabelClass}>
                Price (USD)
              </label>
              <input
                id="price_usd"
                name="price_usd"
                type="number"
                min={1}
                step="0.01"
                required
                placeholder="80.00"
                className={fieldInputClass}
              />
            </div>
            <div>
              <label htmlFor="expires_in_days" className={fieldLabelClass}>
                Expires after
              </label>
              <input
                id="expires_in_days"
                name="expires_in_days"
                type="number"
                min={1}
                max={730}
                placeholder="Never"
                className={fieldInputClass}
              />
              <p className={fieldHintClass}>Days after purchase. Blank = never expires.</p>
            </div>
          </div>
          <SubmitButton className={primaryButtonClass('md')} pendingChildren="Creating…">
            Create pass
          </SubmitButton>
        </form>
      </section>

      {/* ── Your passes ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-fg text-lg font-semibold">Your passes</h2>
        {passes.length === 0 ? (
          <p className="text-muted text-sm">No passes yet. Create one above to start selling.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((p) => (
              <PassRow key={p.id} pass={p} />
            ))}
            {archived.map((p) => (
              <PassRow key={p.id} pass={p} />
            ))}
          </ul>
        )}
        <p className="text-muted text-xs">
          To let an event accept these credits, open the event&apos;s Edit page and turn on “Accept
          pass credits.”
        </p>
      </section>
    </div>
  );
}

function PassRow({ pass }: { pass: HostPass }) {
  const archived = pass.status === 'archived';
  return (
    <li className="border-border-base bg-md-surface-container flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
      <div className="min-w-0">
        <p className="text-fg font-medium">
          {pass.title}
          {archived && (
            <span className="bg-fg/10 text-muted ml-2 rounded-full px-2 py-0.5 text-xs">
              Archived
            </span>
          )}
        </p>
        <p className="text-muted text-sm">
          {pass.creditCount} sessions · {usd(pass.priceCents)} (
          {usd(perSessionCents(pass.priceCents, pass.creditCount))}/session) ·{' '}
          {pass.expiresInDays ? `expires ${pass.expiresInDays}d after purchase` : 'never expires'}
        </p>
      </div>
      {archived ? (
        <form action={reactivatePass.bind(null, pass.id)}>
          <SubmitButton className={neutralButtonClass('sm')} pendingChildren="…">
            Reactivate
          </SubmitButton>
        </form>
      ) : (
        <form action={archivePass.bind(null, pass.id)}>
          <SubmitButton className={neutralButtonClass('sm')} pendingChildren="…">
            Archive
          </SubmitButton>
        </form>
      )}
    </li>
  );
}
