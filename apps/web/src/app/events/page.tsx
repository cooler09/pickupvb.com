import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    // Real query lives in the API; this is a placeholder until the schema is applied.
    const events: Array<{ id: string; title: string; city: string }> = [];

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Find events</h1>
                {user && (
                    <Link
                        href="/events/new"
                        className="rounded-md bg-court-600 px-4 py-2 font-medium text-white hover:bg-court-700"
                    >
                        Host an event
                    </Link>
                )}
            </div>
            {!user && (
                <p className="rounded-md bg-sand-50 p-4 text-sm">
                    <Link href="/login" className="font-semibold text-court-600 hover:underline">
                        Sign in
                    </Link>{' '}
                    to RSVP and host events.
                </p>
            )}
            {events.length === 0 ? (
                <p className="text-net-800/70">No events yet — be the first to host one!</p>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {events.map((e) => (
                        <li key={e.id} className="rounded-lg border border-net-900/10 p-4">
                            <Link href={`/events/${e.id}`} className="font-semibold hover:text-court-600">
                                {e.title}
                            </Link>
                            <p className="text-sm text-net-800/70">{e.city}</p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
