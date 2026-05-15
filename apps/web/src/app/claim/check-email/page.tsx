import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Check your email — PickupVB' };

export default async function ClaimCheckEmailPage(
    props: {
        searchParams: Promise<{ to?: string }>;
    }
) {
    const searchParams = await props.searchParams;
    const to = (searchParams.to ?? '').trim();
    return (
        <div className="mx-auto max-w-md space-y-6 py-10 text-center">
            <h1 className="text-2xl font-bold text-fg">Check your inbox</h1>
            <p className="text-sm text-muted">
                {to ? (
                    <>
                        We sent a confirmation link to <strong className="text-fg">{to}</strong>.
                        Click it to finish creating your account.
                    </>
                ) : (
                    'We sent you a confirmation link. Click it to finish creating your account.'
                )}
            </p>
            <p className="text-xs text-muted">
                After confirming you&apos;ll be asked to set a password. Until then, your guest
                RSVPs are still attached to this browser session.
            </p>
            <div className="flex justify-center gap-3">
                <Link
                    href="/events"
                    className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                >
                    Browse events
                </Link>
                <Link
                    href="/claim"
                    className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                >
                    Use a different email
                </Link>
            </div>
        </div>
    );
}
