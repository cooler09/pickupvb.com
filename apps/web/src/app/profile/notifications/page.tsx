import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { updateNotificationPreferences } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: 'Notifications — PickupVB',
    robots: { index: false, follow: false },
};

type Prefs = {
    email_enabled: boolean;
    sms_enabled: boolean;
    push_enabled: boolean;
    in_app_enabled: boolean;
    sms_phone: string | null;
    sms_opted_in_at: string | null;
};

export default async function NotificationsPrefsPage() {
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile/notifications');

    const { data: row } = await supabase
        .from('notification_preferences')
        .select(
            'email_enabled, sms_enabled, push_enabled, in_app_enabled, sms_phone, sms_opted_in_at',
        )
        .eq('user_id', user.id)
        .maybeSingle();

    const prefs: Prefs = (row as Prefs | null) ?? {
        email_enabled: true,
        sms_enabled: false,
        push_enabled: false,
        in_app_enabled: true,
        sms_phone: null,
        sms_opted_in_at: null,
    };

    return (
        <div className="mx-auto max-w-2xl space-y-6 py-4">
            <div className="space-y-2">
                <Link
                    href={'/profile' as Route}
                    className="text-sm text-primary hover:underline"
                >
                    ← Profile
                </Link>
                <h1 className="text-3xl font-bold">Notifications</h1>
                <p className="text-sm text-muted">
                    Choose how we reach you. Receipts and other transactional
                    messages always go out by email regardless of these settings.
                </p>
            </div>

            <form action={updateNotificationPreferences} className="space-y-4">
                <section className="space-y-3 rounded-lg border border-border-base bg-surface p-5">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                        Channels
                    </h2>

                    <Toggle
                        name="in_app_enabled"
                        label="In-app"
                        description="Bell icon in the header — real-time, free."
                        defaultChecked={prefs.in_app_enabled}
                    />
                    <Toggle
                        name="email_enabled"
                        label="Email"
                        description="Event reminders, invites, and updates."
                        defaultChecked={prefs.email_enabled}
                    />
                    <Toggle
                        name="sms_enabled"
                        label="SMS (text message)"
                        description={
                            prefs.sms_phone
                                ? `To ${prefs.sms_phone}. Reply STOP at any time.`
                                : 'Add a phone number to enable. Coming soon.'
                        }
                        defaultChecked={prefs.sms_enabled}
                        disabled={!prefs.sms_phone}
                    />
                    <Toggle
                        name="push_enabled"
                        label="Browser push"
                        description="Coming soon — free alternative to SMS."
                        defaultChecked={prefs.push_enabled}
                        disabled
                    />
                </section>

                <button
                    type="submit"
                    className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary/90"
                >
                    Save preferences
                </button>
            </form>

            <p className="text-xs text-muted">
                Transactional messages (signup confirmations, refunds, password
                resets, Stripe alerts) are always delivered by email.
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
            className={`flex items-start gap-3 rounded-md border border-border-base/50 p-3 ${disabled ? 'opacity-60' : 'hover:bg-fg/5'
                }`}
        >
            <input
                type="checkbox"
                name={name}
                defaultChecked={defaultChecked}
                disabled={disabled}
                className="mt-1 h-4 w-4 accent-primary"
            />
            <div className="flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted">{description}</p>
            </div>
        </label>
    );
}
