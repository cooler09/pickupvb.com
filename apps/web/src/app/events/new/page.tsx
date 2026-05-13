import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import NewEventForm from './new-event-form';

export const dynamic = 'force-dynamic';

export default async function NewEventPage() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login?next=/events/new');
    }

    return (
        <section className="mx-auto max-w-2xl space-y-6">
            <header className="space-y-1">
                <h1 className="text-3xl font-bold">Host an event</h1>
                <p className="text-sm text-muted">
                    Fill out the details — your event will be published immediately.
                </p>
            </header>
            <NewEventForm />
        </section>
    );
}
