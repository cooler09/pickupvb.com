import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { ProfileForm } from './profile-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your profile — PickupVB' };

type ProfileRow = {
    first_name: string | null;
    last_name: string | null;
    display_name: string;
    home_city: string | null;
};

export default async function ProfilePage() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile');

    const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, display_name, home_city')
        .eq('id', user.id)
        .maybeSingle();

    const profile: ProfileRow = (data as ProfileRow | null) ?? {
        first_name: null,
        last_name: null,
        display_name: user.email?.split('@')[0] ?? 'Player',
        home_city: null,
    };

    return (
        <div className="mx-auto max-w-xl space-y-6 py-4">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold">Your profile</h1>
                <p className="text-sm text-fg/70">
                    This info shows up on events you join or host.
                </p>
            </div>
            <ProfileForm profile={profile} email={user.email ?? ''} />
        </div>
    );
}
