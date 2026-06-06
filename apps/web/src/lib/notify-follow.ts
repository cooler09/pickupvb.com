/**
 * New-follower notification fan-out (lights up the previously-dead
 * `social.follow.new` kind).
 *
 * `addFriend` writes a directed follow edge (ADR 0020 §5) but pinged the
 * followed user on no channel — they only found out by spotting a new follower
 * count. This pings their bell (in_app only, per the kind's channel map) when
 * someone follows them.
 *
 * Coalescing: the edge upsert is idempotent (`ignoreDuplicates` — re-following
 * silently succeeds), so a follow / unfollow / re-follow churn would otherwise
 * re-ping. We skip when an unread follow ping from the *same* follower is
 * already waiting on the recipient's bell. Follower names come from
 * `profiles_public`, never base `profiles` (pitfall #13).
 *
 * Best-effort: runs on the service-role client (session-less fan-out, the
 * sanctioned admin-client case per pitfall #8) and swallows errors so a failed
 * ping never affects the follow it follows.
 */
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';

export async function notifyNewFollower(args: {
  followerId: string;
  followedId: string;
}): Promise<void> {
  const { followerId, followedId } = args;
  if (!followerId || !followedId || followerId === followedId) return;
  try {
    const admin = createSupabaseAdminClient();

    // Coalesce: the in_app href is `/players/<followerId>` (see templates.ts),
    // so match on it to skip a duplicate ping from the same follower.
    const href = `/players/${followerId}`;
    const { data: recent } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', followedId)
      .eq('kind', 'social.follow.new')
      .eq('href', href)
      .is('read_at', null)
      .limit(1);
    if (recent && recent.length > 0) return;

    const { data: row } = await admin
      .from('profiles_public')
      .select('display_name')
      .eq('id', followerId)
      .maybeSingle();
    const followerName = (row as { display_name: string | null } | null)?.display_name ?? 'Someone';

    await notify('social.follow.new', followedId, { followerId, followerName });
  } catch (err) {
    await log.warn('[notify-follow] dispatch failed', {
      followerId,
      followedId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
