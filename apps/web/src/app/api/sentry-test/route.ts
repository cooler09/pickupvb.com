import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { log } from '@/lib/log';
import { isCronAuthorized } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint that intentionally throws so Sentry captures a server-side
 * error. Verify the integration end-to-end with
 * `curl -H "Authorization: Bearer $CRON_SECRET" /api/sentry-test`.
 *
 * Pass `?kind=message` to capture a message instead of an exception, or
 * `?kind=unhandled` to throw outside the request handler (rejected promise).
 *
 * Gated by `isCronAuthorized` (security audit P3 #17): open in local dev (no
 * `CRON_SECRET`), secret-required on every deployed environment. Without the
 * gate, anyone could loop this to inflate Sentry quota / pollute the error feed
 * or force unhandled rejections in the serverless runtime. Returns 404 (not 401)
 * so the debug surface stays invisible to unauthorized callers.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') ?? 'exception';

  if (kind === 'message') {
    Sentry.captureMessage('sentry-test: manual message capture', 'info');
    await Sentry.flush(2000);
    return NextResponse.json({ ok: true, captured: 'message' });
  }

  if (kind === 'unhandled') {
    const err = new Error('sentry-test: unhandled promise rejection');
    await log.error('sentry-test: unhandled', err);
    void Promise.reject(err);
    return NextResponse.json({ ok: true, captured: 'unhandled' });
  }

  const err = new Error('sentry-test: intentional server error');
  await log.error('sentry-test: thrown', err);
  throw err;
}
