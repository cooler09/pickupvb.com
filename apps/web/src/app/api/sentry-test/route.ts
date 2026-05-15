import { NextResponse } from 'next/server';

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

    const Sentry = await import('@sentry/nextjs');

    if (kind === 'message') {
        Sentry.captureMessage('sentry-test: manual message capture', 'info');
        await Sentry.flush(2000);
        return NextResponse.json({ ok: true, captured: 'message' });
    }

    if (kind === 'unhandled') {
        // Fire-and-forget rejected promise — exercises the global handler.
        void Promise.reject(
            new Error('sentry-test: unhandled promise rejection'),
        );
        return NextResponse.json({ ok: true, captured: 'unhandled' });
    }

    throw new Error('sentry-test: intentional server error');
}
