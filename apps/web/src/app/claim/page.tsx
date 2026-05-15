import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import ClaimForm from './claim-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Claim your account — PickupVB' };

export default async function ClaimPage() {
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // No session at all → send them to the login/sign-up flow directly.
    if (!user) redirect('/login?mode=sign-up');
    // Already a real account → nothing to do.
    if (!(user as { is_anonymous?: boolean }).is_anonymous) redirect('/profile');

    return (
        <div className="mx-auto max-w-md space-y-6 py-6">
            <div>
                <h1 className="text-2xl font-bold text-fg">Finish creating your account</h1>
                <p className="mt-1 text-sm text-muted">
                    Add an email and password to keep your RSVPs and access them from any device.
                    All your existing signups will carry over.
                </p>
            </div>

            <ClaimForm />

            <p className="text-xs text-muted">
                Already have an account on a different device?{' '}
                <Link href="/login" className="text-primary hover:underline">
                    Sign in instead
                </Link>{' '}
                — your guest RSVPs won&apos;t merge automatically.
            </p>
        </div>
    );
}
