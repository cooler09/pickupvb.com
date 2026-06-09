import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { listBuyerPasses } from '@/lib/passes';
import { listMemberMemberships, type Membership } from '@/lib/memberships';
import { isPassExpired } from '@/lib/pass-helpers';
import { renderNowMs } from '@/lib/render-now';
import { SubmitButton } from '@/components/submit-button';
import { neutralButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { cancelMembership } from '@/app/events/[id]/membership-actions';

// Dynamic via `getServerSupabase()` (reads cookies); no `force-dynamic` needed.
export const metadata = {
  title: 'Passes & memberships — PickupVB',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ membership?: string }>;

export default async function MyPassesPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/profile/passes');

  const now = renderNowMs();
  const [passes, memberships] = await Promise.all([
    listBuyerPasses(user.id),
    listMemberMemberships(user.id, now),
  ]);
  const { membership: flash } = await searchParams;
  const activeMemberships = memberships.filter((m) => m.isActive);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <header className="space-y-1">
        <h1 className="text-headline-lg font-bold">Passes &amp; memberships</h1>
        <p className="text-muted text-sm">
          Prepaid session credits and host memberships you&apos;ve bought. Redeem one on a
          host&apos;s open-play event from its page.
        </p>
      </header>

      {flash === 'canceled' && (
        <Alert variant="success">
          Membership canceled — you keep access until the end of the current period.
        </Alert>
      )}
      {flash === 'error' && <Alert variant="error">Couldn’t update your membership.</Alert>}

      {/* ── Memberships ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-fg text-lg font-semibold">Memberships</h2>
        {activeMemberships.length === 0 ? (
          <p className="text-muted text-sm">No active memberships.</p>
        ) : (
          <ul className="space-y-2">
            {activeMemberships.map((m) => (
              <MembershipRow key={m.id} membership={m} />
            ))}
          </ul>
        )}
      </section>

      {/* ── Passes ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-fg text-lg font-semibold">Passes</h2>
        {passes.length === 0 ? (
          <p className="text-muted text-sm">
            You don&apos;t have any passes yet. When a host offers one, you&apos;ll see a “Buy a
            pass” option on their event.
          </p>
        ) : (
          <ul className="space-y-2">
            {passes.map((p) => {
              const expired = isPassExpired(p.expiresAt, now);
              const usable = p.creditsRemaining > 0 && !expired;
              return (
                <li
                  key={p.id}
                  className="border-border-base bg-md-surface-container flex items-center justify-between gap-3 rounded-md border p-4"
                >
                  <div className="min-w-0">
                    <p className="text-fg font-medium">{p.titleSnapshot}</p>
                    <p className="text-muted text-sm">
                      {expired
                        ? 'Expired'
                        : p.expiresAt
                          ? `Expires ${new Date(p.expiresAt).toLocaleDateString()}`
                          : 'Never expires'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-title-lg font-bold ${usable ? 'text-fg' : 'text-muted'}`}>
                      {p.creditsRemaining}
                    </p>
                    <p className="text-muted text-xs">of {p.creditsTotal} left</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function MembershipRow({ membership: m }: { membership: Membership }) {
  return (
    <li className="border-border-base bg-md-surface-container flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
      <div className="min-w-0">
        <p className="text-fg font-medium">{m.titleSnapshot}</p>
        <p className="text-muted text-sm">
          {m.cancelAtPeriodEnd
            ? m.currentPeriodEnd
              ? `Ends ${new Date(m.currentPeriodEnd).toLocaleDateString()}`
              : 'Cancels at period end'
            : m.currentPeriodEnd
              ? `Renews ${new Date(m.currentPeriodEnd).toLocaleDateString()}`
              : 'Active'}
        </p>
      </div>
      {!m.cancelAtPeriodEnd && (
        <form action={cancelMembership.bind(null, m.id, '/profile/passes')}>
          <SubmitButton className={neutralButtonClass('sm')} pendingChildren="…">
            Cancel
          </SubmitButton>
        </form>
      )}
    </li>
  );
}
