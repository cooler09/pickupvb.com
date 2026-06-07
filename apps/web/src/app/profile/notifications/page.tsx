import { redirect } from 'next/navigation';
import { primaryButtonClass } from '@/components/primary-button';
import Link from 'next/link';
import type { Route } from 'next';
import { SupabaseNotificationPreferencesRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import { updateNotificationPreferences } from './actions';
import { PushSubscribeButton } from '@/components/push-subscribe-button';
import { PushTestButton } from '@/components/push-test-button';
import { SubmitButton } from '@/components/submit-button';

export const metadata = {
  title: 'Notifications — PickupVB',
  robots: { index: false, follow: false },
};

export default async function NotificationsPrefsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/profile/notifications');

  const settings = await new SupabaseNotificationPreferencesRepository(supabase).find(user.id);
  // Defaults when no row exists yet: email + in-app on, push off.
  const inAppEnabled = settings?.inAppEnabled ?? true;
  const emailEnabled = settings?.emailEnabled ?? true;
  const pushEnabled = settings?.pushEnabled ?? false;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="space-y-2">
        <Link href={'/profile' as Route} className="text-primary text-sm hover:underline">
          ← Profile
        </Link>
        <h1 className="text-headline-lg font-bold">Notifications</h1>
        <p className="text-muted text-sm">
          Choose how we reach you. Receipts and other transactional messages always go out by email
          regardless of these settings.
        </p>
      </div>

      <form action={updateNotificationPreferences} className="space-y-4">
        <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-5">
          <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">Channels</h2>

          <Toggle
            name="in_app_enabled"
            label="In-app"
            description="Bell icon in the header — real-time, free."
            defaultChecked={inAppEnabled}
          />
          <Toggle
            name="email_enabled"
            label="Email"
            description="Event reminders, invites, and updates."
            defaultChecked={emailEnabled}
          />
          <Toggle
            name="push_enabled"
            label="Browser push"
            description="Instant alerts on this device. Enable on each device you want notifications on."
            defaultChecked={pushEnabled}
          />
          <div className="space-y-2 pl-3">
            <PushSubscribeButton
              vapidPublicKey={process.env['NEXT_PUBLIC_VAPID_PUBLIC_KEY'] ?? null}
            />
            <PushTestButton />
          </div>
        </section>

        <SubmitButton className={primaryButtonClass('md')} pendingChildren="Saving…">
          Save preferences
        </SubmitButton>
      </form>

      <p className="text-muted text-xs">
        Transactional messages (signup confirmations, refunds, password resets, Stripe alerts) are
        always delivered by email.
      </p>
    </div>
  );
}

function Toggle({
  name,
  label,
  description,
  defaultChecked,
  disabled = false,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={`border-border-base/50 flex items-start gap-3 rounded-md border p-3 ${
        disabled ? 'opacity-60' : 'hover:bg-fg/5'
      }`}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="accent-primary mt-1 h-4 w-4"
      />
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted text-xs">{description}</p>
      </div>
    </label>
  );
}
