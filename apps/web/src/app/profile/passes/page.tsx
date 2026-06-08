import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { listBuyerPasses } from '@/lib/passes';
import { isPassExpired } from '@/lib/pass-helpers';
import { renderNowMs } from '@/lib/render-now';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'My passes — PickupVB',
  robots: { index: false, follow: false },
};

export default async function MyPassesPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/profile/passes');

  const passes = await listBuyerPasses(user.id);
  const now = renderNowMs();

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <header className="space-y-1">
        <h1 className="text-headline-lg font-bold">My passes</h1>
        <p className="text-muted text-sm">
          Prepaid session credits you&apos;ve bought from hosts. Redeem one on a host&apos;s
          open-play event from its page.
        </p>
      </header>

      {passes.length === 0 ? (
        <p className="text-muted text-sm">
          You don&apos;t have any passes yet. When a host offers one, you&apos;ll see a “Buy a pass”
          option on their event.
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
    </div>
  );
}
