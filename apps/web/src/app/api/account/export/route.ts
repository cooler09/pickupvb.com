import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * GET /api/account/export
 *
 * GDPR Art. 20 / CCPA portability — a single machine-readable JSON file with the
 * authenticated user's own data across every table that stores it (privacy audit
 * P3 #12, incl. the chat surface from #15).
 *
 * Runs on the **user-scoped** client so RLS is the safety net: every category is
 * filtered to the caller's own id, and there is no admin / RLS-bypass. Each table
 * here has an owner/self RLS read path, so the filter and the policy agree.
 *
 * Scope decisions:
 * - Cross-user identifiers are omitted where they'd expose *who else* the user
 *   touched beyond what is plainly theirs — e.g. a received tip keeps the
 *   `tipper_display_name` the tipper chose to show but not `tipper_user_id`; the
 *   friend/block lists keep the counterpart id because that list is the user's
 *   own data.
 * - The push-subscription `auth` secret is excluded (it's a credential, not
 *   personal data).
 * - Anonymous sessions may export too — their participation data is still theirs.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const uid = user.id;

  try {
    const [
      profile,
      eventsHosted,
      participation,
      tipsSent,
      tipsReceived,
      payments,
      friends,
      teamMembers,
      listings,
      notifications,
      prefs,
      pushSubs,
      conversations,
      messages,
      blocks,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase
        .from('events')
        .select(
          'id, title, type, status, visibility, starts_at, ends_at, city, region, country, venue_name, created_at',
        )
        .eq('host_id', uid)
        .order('starts_at', { ascending: false }),
      supabase
        .from('event_participants')
        .select('id, division_id, role, position, notes, joined_at')
        .eq('user_id', uid),
      supabase
        .from('event_tips')
        .select('id, event_id, amount_cents, message, status, created_at, paid_at, refunded_at')
        .eq('tipper_user_id', uid),
      supabase
        .from('event_tips')
        .select(
          'id, event_id, amount_cents, tipper_display_name, status, created_at, paid_at, refunded_at',
        )
        .eq('host_id', uid),
      supabase
        .from('event_payment_audit')
        .select('id, event_id, action, amount_cents, payment_intent_id, occurred_at')
        .eq('user_id', uid)
        .order('occurred_at', { ascending: true }),
      supabase.from('friendships').select('friend_id, created_at').eq('user_id', uid),
      supabase
        .from('event_team_entry_members')
        .select('id, entry_id, display_name, email, sort_order, created_at')
        .eq('user_id', uid),
      supabase
        .from('community_listings')
        .select(
          'id, title, external_url, status, city, region, starts_at, created_at, claimed_at, claimed_event_id',
        )
        .eq('submitter_user_id', uid),
      supabase
        .from('notifications')
        .select('id, kind, title, body, href, data, read_at, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false }),
      supabase.from('notification_preferences').select('*').eq('user_id', uid).maybeSingle(),
      supabase
        .from('push_subscriptions')
        .select('id, endpoint, user_agent, created_at, last_used_at')
        .eq('user_id', uid),
      supabase
        .from('conversation_participants')
        .select('conversation_id, role, joined_at, last_read_at, muted_at')
        .eq('user_id', uid),
      supabase
        .from('messages')
        .select('id, conversation_id, body, attachments, edited_at, deleted_at, created_at')
        .eq('sender_id', uid)
        .order('created_at', { ascending: true }),
      supabase.from('user_blocks').select('blocked_id, created_at').eq('blocker_id', uid),
    ]);

    // A GDPR export that silently drops a category is worse than one that fails
    // — surface the first read error so the user can retry rather than receiving
    // a partial file. (An RLS-empty result is `[]`, not an error.)
    const parts = {
      profile,
      eventsHosted,
      participation,
      tipsSent,
      tipsReceived,
      payments,
      friends,
      teamMembers,
      listings,
      notifications,
      prefs,
      pushSubs,
      conversations,
      messages,
      blocks,
    };
    for (const [label, res] of Object.entries(parts)) {
      if (res.error) throw new Error(`${label}: ${res.error.message}`);
    }

    const generatedAt = new Date().toISOString();
    const payload = {
      export_generated_at: generatedAt,
      format_version: 1,
      user: { id: uid, email: user.email ?? null },
      profile: profile.data ?? null,
      events_hosted: eventsHosted.data ?? [],
      event_participation: participation.data ?? [],
      tips_sent: tipsSent.data ?? [],
      tips_received: tipsReceived.data ?? [],
      payment_history: payments.data ?? [],
      friendships: friends.data ?? [],
      team_memberships: teamMembers.data ?? [],
      community_listings_submitted: listings.data ?? [],
      notifications: notifications.data ?? [],
      notification_preferences: prefs.data ?? null,
      push_subscriptions: pushSubs.data ?? [],
      chat_conversations: conversations.data ?? [],
      chat_messages_sent: messages.data ?? [],
      user_blocks: blocks.data ?? [],
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="pickupvb-data-export-${generatedAt.slice(0, 10)}.json"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (err) {
    await log.error('[account-export] failed', err);
    return new NextResponse('Export failed. Please try again.', { status: 500 });
  }
}
