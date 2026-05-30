'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SupabaseBroadcastRepository, SupabaseProfileRepository } from '@pickupvb/infrastructure';
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

  // Insert the broadcast row on the user client — RLS enforces captain-only.
  let broadcastId: string;
  try {
    const created = await new SupabaseBroadcastRepository(supabase).create({
      senderId: user.id,
      audienceType: 'team_members',
      audienceId: teamId,
      subject: subject || null,
      body,
      channels: ['email', 'in_app'],
    });
    broadcastId = created.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not send broadcast.' };
  }

  // Fan out via admin client. team_members + teams are team-subdomain reads
  // (left raw); the sender's name comes from the profile read port.
  const admin = getAdminSupabase();
  const [{ data: memRows }, { data: teamRow }, senderCard] = await Promise.all([
    admin.from('team_members').select('user_id').eq('team_id', teamId).eq('status', 'active'),
    admin.from('teams').select('slug, name').eq('id', teamId).maybeSingle(),
    new SupabaseProfileRepository(admin).findCardById(user.id),
  ]);
  const members = (memRows as { user_id: string }[] | null) ?? [];
  const teamRowTyped = teamRow as { slug: string; name: string } | null;
  const teamName = teamRowTyped?.name ?? 'your team';
  const teamSlug = teamRowTyped?.slug ?? teamId;
  const senderName = senderCard?.displayName ?? 'Your captain';

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

  await new SupabaseBroadcastRepository(admin).markSent(broadcastId);

  revalidatePath(`/teams/${teamSlug}`);
  redirect(`/teams/${teamSlug}?broadcast=sent`);
}
