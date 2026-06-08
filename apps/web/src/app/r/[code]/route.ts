import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { recordReferralAttribution, REFERRAL_COOKIE } from '@/lib/referrals';

/**
 * Referral landing link `/r/<referrerUserId>` (ADR 0039, monetization O-3).
 * If the visitor is already a real signed-in user, attribute the referral now;
 * otherwise drop a 30-day cookie the auth callback consumes after they sign up.
 * Always redirects home. Best-effort — a bad code just redirects.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await ctx.params;
  const res = NextResponse.redirect(new URL('/', req.nextUrl.origin));
  if (!UUID_RE.test(code)) return res;

  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && !user.is_anonymous) {
      await recordReferralAttribution(user.id, code);
      return res;
    }
  } catch {
    // fall through to cookie
  }

  res.cookies.set(REFERRAL_COOKIE, code, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
