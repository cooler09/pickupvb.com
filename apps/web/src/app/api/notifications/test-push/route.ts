/**
 * Push self-test. POSTed by the "Send test notification" button on
 * `/profile/notifications`. Sends a notification to the caller's own
 * `push_subscriptions` **directly** via `sendWebPush` — bypassing the outbox,
 * the cron worker, and per-kind/preference gating — so it isolates the layer
 * that's failing when "push doesn't work":
 *
 *   - `vapid-not-configured`  → server is missing VAPID_* env vars
 *   - `no-subscriptions`      → this device never subscribed (enable push first)
 *   - per-sub `statusCode`    → the push service rejected delivery
 *   - `ok: true`              → the whole path works on this device
 *
 * This matters most on **preview/dev** deployments, where Vercel Cron does not
 * run, so the normal outbox-drain path is dormant — the in-request send here
 * still works. Dead endpoints (404/410) are pruned as a side effect.
 */
import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { sendWebPush, type WebPushSubscription } from '@/lib/web-push';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function abbreviate(endpoint: string): string {
  return endpoint.length > 44 ? `${endpoint.slice(0, 32)}…${endpoint.slice(-8)}` : endpoint;
}

export async function POST(): Promise<Response> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const configured = Boolean(process.env['VAPID_PUBLIC_KEY'] && process.env['VAPID_PRIVATE_KEY']);

  const { data: rows } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', user.id);
  const subs = (rows as WebPushSubscription[] | null) ?? [];

  if (!configured) {
    return NextResponse.json({
      ok: false,
      reason: 'vapid-not-configured',
      configured: false,
      subscriptions: subs.length,
      hint: 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and NEXT_PUBLIC_VAPID_PUBLIC_KEY for this environment.',
    });
  }

  if (subs.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'no-subscriptions',
      configured: true,
      subscriptions: 0,
      hint: 'Enable push on this device first, then test.',
    });
  }

  const payload = {
    title: 'PickupVB',
    body: 'Test notification — push is working on this device 🎉',
    href: '/profile/notifications',
    tag: 'test-push',
  };

  const settled = await Promise.allSettled(subs.map((s) => sendWebPush(s, payload)));
  const gone: string[] = [];
  const results = settled.map((r, i) => {
    const endpoint = subs[i]!.endpoint;
    if (r.status === 'rejected') {
      return { endpoint: abbreviate(endpoint), ok: false, message: String(r.reason).slice(0, 160) };
    }
    const v = r.value;
    if (v.ok) return { endpoint: abbreviate(endpoint), ok: true };
    if (v.gone) gone.push(endpoint);
    return {
      endpoint: abbreviate(endpoint),
      ok: false,
      statusCode: v.statusCode,
      gone: v.gone,
      message: v.message,
    };
  });

  let pruned = 0;
  if (gone.length > 0) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .in('endpoint', gone);
    if (!error) pruned = gone.length;
  }

  return NextResponse.json({
    ok: results.some((r) => r.ok),
    configured: true,
    subscriptions: subs.length,
    delivered: results.filter((r) => r.ok).length,
    pruned,
    results,
  });
}
