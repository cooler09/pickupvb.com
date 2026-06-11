import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Check your email — PickupVB' };

export default async function ClaimCheckEmailPage(props: {
  searchParams: Promise<{ to?: string; next?: string }>;
}) {
  const searchParams = await props.searchParams;
  const to = (searchParams.to ?? '').trim();
  // Preserve the in-flight gate destination so "Use a different email" keeps
  // the user on track (same-origin relative only — mirrors /auth/callback).
  const rawNext = searchParams.next;
  const safeNext = rawNext && /^\/(?![/\\])/.test(rawNext) ? rawNext : undefined;
  return (
    <div className="mx-auto max-w-md space-y-6 py-10 text-center">
      <h1 className="text-headline-sm text-fg font-bold">Check your inbox</h1>
      <p className="text-muted text-sm">
        {to ? (
          <>
            We sent a confirmation link to <strong className="text-fg">{to}</strong>. Click it to
            finish creating your account.
          </>
        ) : (
          'We sent you a confirmation link. Click it to finish creating your account.'
        )}
      </p>
      <p className="text-muted text-xs">
        After confirming you&apos;ll be asked to set a password. Until then, your guest signups are
        still attached to this browser session.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href="/events"
          className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
        >
          Browse events
        </Link>
        <Link
          href={safeNext ? `/claim?next=${encodeURIComponent(safeNext)}` : '/claim'}
          className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
        >
          Use a different email
        </Link>
      </div>
    </div>
  );
}
