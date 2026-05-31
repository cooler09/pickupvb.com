/**
 * Push subscription management. Browsers call `pushManager.subscribe()` and
 * POST the resulting `PushSubscription.toJSON()` here. We dedupe by endpoint
 * (unique constraint) and upsert by user.
 */
import { NextResponse } from 'next/server';
import { SupabasePushSubscriptionRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(req: Request): Promise<Response> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const auth = body.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'missing-fields' }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;

  // Upsert on endpoint — if the same endpoint exists for a different user
  // (rare; same browser, account switch) we overwrite ownership.
  try {
    await new SupabasePushSubscriptionRepository(supabase).upsert(user.id, {
      endpoint,
      p256dh,
      auth,
      userAgent,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'missing-endpoint' }, { status: 400 });

  // Best-effort unsubscribe — failures here don't matter to the client (the
  // worker prunes dead endpoints anyway), matching the prior fire-and-forget.
  try {
    await new SupabasePushSubscriptionRepository(supabase).removeForUser(user.id, endpoint);
  } catch {
    // ignore
  }
  return NextResponse.json({ ok: true });
}
