import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import ClaimForm from './claim-form';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Claim your account — PickupVB',
  robots: { index: false, follow: false },
};

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Where the host/team gate wanted to send the user (e.g. /events/new).
  // Same-origin relative only — reject `//evil.com` / `/\evil.com` (security
  // audit P1 #1, mirrors /auth/callback).
  const { next } = await searchParams;
  const safeNext = next && /^\/(?![/\\])/.test(next) ? next : undefined;

  // No session at all → send them to the login/sign-up flow directly.
  if (!user) redirect('/login?mode=sign-up');
  // Already a real account → nothing to do.
  if (!(user as { is_anonymous?: boolean }).is_anonymous) redirect('/profile');

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div>
        <h1 className="text-fg text-2xl font-bold">Finish creating your account</h1>
        <p className="text-muted mt-1 text-sm">
          Add an email and password to keep your signups and access them from any device. All your
          existing signups will carry over.
        </p>
      </div>

      <ClaimForm {...(safeNext ? { next: safeNext } : {})} />

      <p className="text-muted text-xs">
        Already have an account on a different device?{' '}
        <Link href="/login" className="text-primary hover:underline">
          Sign in instead
        </Link>{' '}
        — your guest signups won&apos;t merge automatically.
      </p>
    </div>
  );
}
