import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NewEventPage() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    return (
        <section className="space-y-6">
            <h1 className="text-3xl font-bold">Host an event</h1>
            <p className="text-net-800/70">
                Event creation form coming soon. Wire this up to{' '}
                <code className="rounded bg-net-900/5 px-1">POST /events</code> on the API.
            </p>
            <Link href="/events" className="text-court-600 hover:underline">
                ← Back to events
            </Link>
        </section>
    );
}
