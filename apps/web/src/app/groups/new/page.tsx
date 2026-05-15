import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import NewGroupForm from './new-group-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New group — PickupVB' };

export default async function NewGroupPage() {
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/groups/new');

    return (
        <section className="mx-auto max-w-xl space-y-6 py-4">
            <header className="space-y-1">
                <h1 className="text-2xl font-bold">Create a group</h1>
                <p className="text-sm text-muted">
                    Give your club, league, or crew a profile. You&apos;ll be the owner.
                </p>
            </header>
            <NewGroupForm />
        </section>
    );
}
