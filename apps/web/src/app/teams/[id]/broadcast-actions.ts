'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { notify } from '@/lib/notify';

type State = { ok?: boolean; error?: string };

/**
 * Captain-only broadcast to all active team members.
 *
 * Insert into `broadcasts` via the user-session client so RLS enforces
 * captain authorization, then fan out via admin client to reach every
 * active member.
 */
export async function sendTeamBroadcast(
    teamId: string,
    _prev: State,
    formData: FormData,
): Promise<State> {
    const subject = String(formData.get('subject') ?? '').trim();
    const body = String(formData.get('body') ?? '').trim();
    if (!body || body.length < 3) return { error: 'Message body is required.' };
    if (body.length > 2000) return { error: 'Message is too long (max 2,000 characters).' };

    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'You must be signed in.' };

    const { data: inserted, error: insErr } = await supabase
        .from('broadcasts')
        .insert({
            sender_id: user.id,
            audience_type: 'team_members',
            audience_id: teamId,
            subject: subject || null,
            body,
            channels: ['email', 'in_app'],
        } as never)
        .select('id')
        .single();
    if (insErr) return { error: insErr.message };
    const broadcastId = (inserted as { id: string } | null)?.id ?? '';

    const admin = getAdminSupabase();
    const [{ data: memRows }, { data: teamRow }, { data: senderRow }] = await Promise.all([
        admin
            .from('team_members')
            .select('user_id')
            .eq('team_id', teamId)
            .eq('status', 'active'),
        admin.from('teams').select('slug, name').eq('id', teamId).maybeSingle(),
        admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    ]);
    const members = (memRows as { user_id: string }[] | null) ?? [];
    const teamRowTyped = teamRow as { slug: string; name: string } | null;
    const teamName = teamRowTyped?.name ?? 'your team';
    const teamSlug = teamRowTyped?.slug ?? teamId;
    const senderName =
        (senderRow as { display_name: string | null } | null)?.display_name ?? 'Your captain';

    for (const m of members) {
        if (m.user_id === user.id) continue;
        await notify(
            'broadcast.host_message',
            m.user_id,
            {
                subject: subject || `Message about ${teamName}`,
                body,
                senderName,
            },
            { idempotencyKey: `broadcast:${broadcastId}:${m.user_id}` },
        );
    }

    await admin
        .from('broadcasts')
        .update({ sent_at: new Date().toISOString() } as never)
        .eq('id', broadcastId);

    revalidatePath(`/teams/${teamSlug}`);
    redirect(`/teams/${teamSlug}?broadcast=sent`);
}
