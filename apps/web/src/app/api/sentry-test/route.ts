import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint that intentionally throws so Sentry captures a server-side
 * error. Hit `/api/sentry-test` to verify the integration end-to-end.
 *
 * Pass `?kind=message` to capture a message instead of an exception, or
 * `?kind=unhandled` to throw outside the request handler (rejected promise).
 */
export async function GET(request: Request) {
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
