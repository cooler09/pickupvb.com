import * as Sentry from '@sentry/nextjs';

type Ctx = Record<string, unknown>;

const isServer = typeof window === 'undefined';

/**
 * On Vercel serverless, the function process is frozen the moment the
 * response is sent. Sentry's transport is async, so any in-flight event
 * can be lost. Calling `flush()` blocks until pending events are delivered
 * (or the timeout elapses). On long-lived Node servers and in the browser
 * this is a no-op worth doing.
 */
async function flushIfServerless(): Promise<void> {
    if (isServer && process.env['VERCEL']) {
        try {
            await Sentry.flush(2000);
        } catch {
            // Don't let logging failures break the caller.
        }
    }
}

/**
 * Thin logging wrapper around `console` + Sentry. Use instead of calling
 * `console.error` and `Sentry.captureException` separately.
 *
 * - `debug` — dev-only console output.
 * - `info` — console + Sentry breadcrumb (no event consumed).
 * - `warn` — console + Sentry message at `warning` level.
 * - `error` — console + Sentry exception. Awaitable so callers in server
 *   actions / route handlers can guarantee delivery before responding.
 */
export const log = {
    debug(msg: string, ctx?: Ctx): void {
        if (process.env.NODE_ENV !== 'production') {
            console.debug(msg, ctx ?? '');
        }
    },

    info(msg: string, ctx?: Ctx): void {
        console.info(msg, ctx ?? '');
        Sentry.addBreadcrumb({
            level: 'info',
            message: msg,
            ...(ctx ? { data: ctx } : {}),
        });
    },

    warn(msg: string, ctx?: Ctx): void {
        console.warn(msg, ctx ?? '');
        Sentry.captureMessage(msg, {
            level: 'warning',
            ...(ctx ? { extra: ctx } : {}),
        });
    },

    /**
     * Capture an unexpected error. Pass the message describing what we were
     * doing and the underlying `unknown` thrown value. Returns a promise so
     * callers in serverless code can `await` to guarantee delivery.
     */
    async error(msg: string, err: unknown, ctx?: Ctx): Promise<void> {
        console.error(msg, err, ctx ?? '');
        Sentry.captureException(err, {
            extra: { message: msg, ...(ctx ?? {}) },
        });
        await flushIfServerless();
    },
};
