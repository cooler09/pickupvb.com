/**
 * One-click email unsubscribe (RFC 8058) — the target of the `List-Unsubscribe`
 * header the worker stamps on non-transactional mail.
 *
 * - **POST** is what Gmail / Apple Mail hit directly when the user taps the
 *   native "Unsubscribe" chip (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`).
 * - **GET** is the human clicking the link; it unsubscribes too (the token is
 *   the authorization) and renders a small confirmation page.
 *
 * Both verify the HMAC token (no session — the recipient may not be logged in
 * on this device) and flip `email_enabled = false`, which silences every
 * *non-transactional* email while leaving the in-app bell and CAN-SPAM
 * transactional mail (receipts, account events) intact. Granular control still
 * lives at /profile/notifications. Writes on the admin client because there's no
 * session to scope to (token-gated, like a webhook — AGENTS.md pitfall #8).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function unsubscribe(token: string | null): Promise<boolean> {
  const userId = verifyUnsubscribeToken(token);
  if (!userId) return false;
  const admin = createSupabaseAdminClient();
  // Partial upsert: every other column has a NOT NULL default (20260524000000),
  // so a brand-new row lands with email off + the rest at their defaults, and an
  // existing row only flips email_enabled.
  const { error } = await admin
    .from('notification_preferences')
    .upsert({ user_id: userId, email_enabled: false }, { onConflict: 'user_id' });
  return !error;
}

function page(ok: boolean): Response {
  const body = ok
    ? `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
       <title>Unsubscribed — PickupVB</title>
       <div style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center">
         <h1 style="font-size:1.25rem">You're unsubscribed</h1>
         <p style="color:#555">You won't get marketing or activity emails from PickupVB anymore. Receipts and account notices still come through.</p>
         <p><a href="https://pickupvb.com/profile/notifications" style="color:#0d7">Manage notification settings</a></p>
       </div>`
    : `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
       <title>Link expired — PickupVB</title>
       <div style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center">
         <h1 style="font-size:1.25rem">This link isn't valid</h1>
         <p style="color:#555">The unsubscribe link is malformed or expired. Manage your email settings from your profile instead.</p>
         <p><a href="https://pickupvb.com/profile/notifications" style="color:#0d7">Manage notification settings</a></p>
       </div>`;
  return new Response(body, {
    status: ok ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const ok = await unsubscribe(new URL(req.url).searchParams.get('u'));
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

export async function GET(req: NextRequest): Promise<Response> {
  const ok = await unsubscribe(new URL(req.url).searchParams.get('u'));
  return page(ok);
}
