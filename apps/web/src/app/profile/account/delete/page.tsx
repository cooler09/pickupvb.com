import Link from 'next/link';
import type { Route } from 'next';
import { UserId } from '@pickupvb/domain';
import { SupabaseDeletionRequestRepository } from '@pickupvb/infrastructure';
import { requireRealUser } from '@/lib/server-auth';
import { fieldInputClass, fieldLabelClass, fieldHintClass } from '@/components/field-styles';
import { errorButtonClass } from '@/components/primary-button';
import { requestAccountDeletion, cancelAccountDeletion } from './actions';

export const metadata = {
  title: 'Delete account — PickupVB',
  robots: { index: false, follow: false },
};

const cardClass = 'border-border-base bg-surface rounded-shape-sm border p-5 sm:p-6';

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default async function DeleteAccountPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Real-user only: anonymous sessions have no email and minimal data — they
  // abandon the session or /claim, they don't delete (ADR 0029).
  const { supabase, user } = await requireRealUser('/profile/account/delete');
  const sp = await props.searchParams;
  const status = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  const active = await new SupabaseDeletionRequestRepository(supabase).findActiveByUser(
    UserId(user.id),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <header className="space-y-1">
        <Link href={'/profile' as Route} className="text-primary text-sm hover:underline">
          ← Back to profile
        </Link>
        <h1 className="text-2xl font-bold">Delete account</h1>
      </header>

      {status === 'cancelled' && !active && (
        <p
          role="status"
          className="rounded-shape-sm border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200"
        >
          Your account deletion was cancelled. Nothing was removed.
        </p>
      )}

      {active ? (
        <section className="rounded-shape-sm border border-amber-300 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Deletion scheduled
          </h2>
          <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
            Your account and personal data are scheduled to be{' '}
            <strong>permanently deleted on {formatDate(active.scheduledFor)}</strong>. Nothing is
            removed until then — you can cancel any time before that date.
          </p>
          <form action={cancelAccountDeletion} className="mt-4">
            <button
              type="submit"
              className="border-border-base bg-surface hover:bg-fg/5 rounded-md border px-4 py-1.5 text-sm font-medium"
            >
              Cancel deletion — keep my account
            </button>
          </form>
        </section>
      ) : (
        <section className={cardClass}>
          <h2 className="text-lg font-bold">Permanently delete your account</h2>
          <div className="text-muted mt-2 space-y-2 text-sm">
            <p>
              This schedules your account for permanent deletion after a{' '}
              <strong>30-day grace period</strong>. You can cancel any time before then. When it
              runs we:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>erase your profile, name, photos, social links, and saved details;</li>
              <li>cancel any active Pro subscription;</li>
              <li>remove your messages, notifications, and saved devices.</li>
            </ul>
            <p>
              Events you hosted and payment records are kept (anonymized as “Former member”) where
              we’re legally required to retain them. Want a copy of your data first?{' '}
              <a href="/api/account/export" download className="text-primary hover:underline">
                Download it here
              </a>
              .
            </p>
          </div>

          {error === 'confirm' && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              Type <strong>DELETE</strong> exactly to confirm.
            </p>
          )}

          <form action={requestAccountDeletion} className="mt-4 space-y-4">
            <div>
              <label htmlFor="reason" className={fieldLabelClass}>
                Reason (optional)
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={2}
                maxLength={500}
                className={fieldInputClass}
              />
              <p className={fieldHintClass}>Helps us improve — never shown to anyone else.</p>
            </div>
            <div>
              <label htmlFor="confirm" className={fieldLabelClass}>
                Type DELETE to confirm
              </label>
              <input
                id="confirm"
                name="confirm"
                autoComplete="off"
                placeholder="DELETE"
                className={fieldInputClass}
              />
            </div>
            <button type="submit" className={errorButtonClass('md')}>
              Schedule account deletion
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
