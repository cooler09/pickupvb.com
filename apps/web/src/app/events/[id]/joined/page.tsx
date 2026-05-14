import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { cancelGuestSignup } from '../guest-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: "You're signed up — PickupVB" };

export default async function GuestJoinedPage({
    params,
    searchParams,
}: {
    params: { id: string };
    searchParams: { gid?: string; t?: string };
}) {
    const token = (searchParams.t ?? '').trim();
    if (!token) notFound();

    const supabase = getServerSupabase();
    const { data: eventData } = await supabase
        .from('events_view')
        .select('id, title, starts_at, city, region')
        .eq('id', params.id)
        .maybeSingle();
    const ev = eventData as
        | { id: string; title: string; starts_at: string; city: string; region: string }
        | null;
    if (!ev) notFound();

    const cancelUrl = `/events/${ev.id}/joined?gid=${encodeURIComponent(searchParams.gid ?? '')}&t=${encodeURIComponent(token)}`;
    const startsAt = new Date(ev.starts_at);

    return (
        <div className="mx-auto max-w-xl space-y-6 py-4">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                <h1 className="text-xl font-bold text-primary">You&apos;re signed up!</h1>
                <p className="mt-1 text-sm text-fg">
                    See you at <strong>{ev.title}</strong> on{' '}
                    {startsAt.toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                    })}{' '}
                    in {ev.city}, {ev.region}.
                </p>
            </div>

            <section className="space-y-2 rounded-lg border border-border-base p-4">
                <h2 className="text-sm font-semibold text-fg">Need to cancel?</h2>
                <p className="text-xs text-muted">
                    Bookmark this page — it&apos;s the only way to cancel without an account. The link
                    contains a private cancellation token.
                </p>
                <p className="rounded bg-fg/5 px-2 py-1 text-xs">
                    <code className="break-all">{cancelUrl}</code>
                </p>
                <form action={cancelGuestSignup.bind(null, ev.id, token)}>
                    <button
                        type="submit"
                        className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                        Cancel my signup
                    </button>
                </form>
            </section>

            <div className="flex gap-3">
                <Link
                    href={`/events/${ev.id}`}
                    className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                >
                    ← Back to event
                </Link>
                <Link
                    href="/events"
                    className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                >
                    Browse more events
                </Link>
            </div>
        </div>
    );
}
