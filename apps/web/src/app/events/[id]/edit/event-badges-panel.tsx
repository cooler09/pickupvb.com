import Link from 'next/link';
import Image from 'next/image';
import { Alert } from '@/components/alert';
import { neutralButtonClass, primaryButtonClass } from '@/components/primary-button';
import { AddEventBadgeForm } from './add-event-badge-form';
import { removeEventBadge, startBadgeSlotCheckoutFromForm } from './badge-actions';

export type HostBadge = {
  id: string;
  label: string;
  description: string | null;
  iconUrl: string | null;
  grantRule: string;
};

/**
 * Host panel for authoring collectible event badges (gamification Phase 2, Pro).
 * Mirrors the sponsor panel: Pro-gated authoring, flash-param feedback, and a
 * thin list + add form. Attendees auto-earn `on_attend` badges; earned badges
 * appear in players' trophy cases (profile + public player page).
 */
export function EventBadgesPanel({
  eventId,
  userId,
  returnPath,
  badges,
  canUseBadges,
  badgeFlash,
  badgeMsg,
}: {
  eventId: string;
  userId: string;
  returnPath: string;
  badges: HostBadge[];
  canUseBadges: boolean;
  badgeFlash?: string;
  badgeMsg?: string;
}) {
  return (
    <section className="border-border-base rounded-shape-sm space-y-4 border p-4">
      <header className="space-y-1">
        <h2 className="text-fg text-lg font-semibold">Collectible badges (Pro)</h2>
        <p className="text-muted text-sm">
          Give attendees a badge to collect for this event. It shows on their profile and public
          player page.
        </p>
      </header>

      {badgeFlash === 'saved' && (
        <Alert variant="success" title="Badge added">
          Attendees will collect it automatically once the event has finished.
        </Alert>
      )}
      {badgeFlash === 'removed' && (
        <Alert variant="success" title="Badge removed">
          New attendees will no longer earn it.
        </Alert>
      )}
      {badgeFlash === 'pro' && (
        <Alert variant="warning" title="Pro required">
          Collectible event badges are a Pro feature.{' '}
          <Link href="/pricing" className="underline">
            See pricing
          </Link>
          .
        </Alert>
      )}
      {badgeFlash === 'unauthorized' && (
        <Alert variant="error" title="Not allowed">
          You can&apos;t manage badges for this event.
        </Alert>
      )}
      {badgeFlash === 'invalid' && (
        <Alert variant="error" title="Invalid badge">
          {badgeMsg ?? 'Please fix the badge fields and try again.'}
        </Alert>
      )}
      {badgeFlash === 'error' && (
        <Alert variant="error" title="Could not save badge">
          {badgeMsg ?? 'Please try again.'}
        </Alert>
      )}
      {badgeFlash === 'checkout_success' && (
        <Alert variant="info" title="Payment received">
          Unlocking collectible badges for this event — refresh in a moment if the form is still
          locked.
        </Alert>
      )}
      {badgeFlash === 'checkout_cancel' && (
        <Alert variant="warning" title="Checkout canceled">
          Badge unlock checkout was canceled.
        </Alert>
      )}

      {badges.length > 0 && (
        <ul className="space-y-2">
          {badges.map((b) => (
            <li
              key={b.id}
              className="border-border-base flex items-center gap-3 rounded-md border p-3"
            >
              <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
                {b.iconUrl ? (
                  <Image
                    src={b.iconUrl}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    aria-hidden
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span aria-hidden className="text-sm font-bold">
                    ★
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate font-medium">{b.label}</p>
                {b.description && <p className="text-muted truncate text-sm">{b.description}</p>}
                <p className="text-muted text-xs">
                  {b.grantRule === 'on_attend' ? 'Earned by attending' : 'Awarded manually'}
                </p>
              </div>
              <form action={removeEventBadge.bind(null, eventId, b.id, returnPath)}>
                <button type="submit" className={neutralButtonClass('sm')}>
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {canUseBadges ? (
        <AddEventBadgeForm eventId={eventId} userId={userId} returnPath={returnPath} />
      ) : (
        <div className="border-border-base space-y-3 rounded-md border border-dashed p-4">
          <Alert variant="info" title="Unlock collectible badges">
            Included with Pro, or unlock them for this one event with a one-time $5 purchase.{' '}
            <Link href="/pricing" className="underline">
              See Pro
            </Link>
            .
          </Alert>
          <form action={startBadgeSlotCheckoutFromForm.bind(null, eventId, returnPath)}>
            <button type="submit" className={primaryButtonClass('md')}>
              Unlock badges for this event ($5)
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
