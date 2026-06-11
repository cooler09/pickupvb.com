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

  // Prefill from whatever the guest already gave at signup so they don't re-type
  // (guest signup captures display_name; an attached email is surfaced as
  // `email`, or `new_email` while confirmation is pending). anonymous-claim.md AC-6.
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('first_name, last_name, display_name')
    .eq('id', user.id)
    .maybeSingle();
  const p = profileRow as {
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
  } | null;
  const nameParts = (p?.display_name ?? '').trim().split(/\s+/).filter(Boolean);
  const defaultFirstName = p?.first_name || nameParts[0] || '';
  const defaultLastName =
    p?.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
  const defaultEmail = user.email || (user as { new_email?: string }).new_email || '';

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div>
        <h1 className="text-fg text-headline-sm font-bold">Finish creating your account</h1>
        <p className="text-muted mt-1 text-sm">
          Add an email and password to keep your signups and access them from any device. All your
          existing signups will carry over.
        </p>
      </div>

      <ClaimForm
        {...(safeNext ? { next: safeNext } : {})}
        defaultFirstName={defaultFirstName}
        defaultLastName={defaultLastName}
        defaultEmail={defaultEmail}
      />

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
