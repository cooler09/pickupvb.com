import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { isAnonymousUser } from '@/lib/server-auth';
import NewTeamForm from './new-team-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New team — PickupVB' };

export default async function NewTeamPage() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/teams/new');
    if (isAnonymousUser(user)) redirect('/claim?next=/teams/new');

    return (
        <section className="mx-auto max-w-xl space-y-6 py-4">
            <header className="space-y-1">
                <h1 className="text-2xl font-bold">Create a team</h1>
                <p className="text-sm text-muted">
                    You&apos;ll be the captain. Add teammates from the team page after you save.
                </p>
            </header>
            <NewTeamForm />
        </section>
    );
}
