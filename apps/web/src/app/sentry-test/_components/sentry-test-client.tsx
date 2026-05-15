'use client';

import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';

type Status = { kind: 'idle' } | { kind: 'ok'; msg: string } | { kind: 'err'; msg: string };

export default function SentryTestClient() {
    const [status, setStatus] = useState<Status>({ kind: 'idle' });

    function clientThrow() {
        setStatus({ kind: 'ok', msg: 'Throwing in render path…' });
        // Throw inside an event handler — Sentry's React error handler captures it.
        throw new Error('sentry-test: client-side intentional error');
    }

    function clientCaptureException() {
        const eventId = Sentry.captureException(
            new Error('sentry-test: client captureException'),
        );
        setStatus({ kind: 'ok', msg: `captureException eventId=${eventId}` });
    }

    function clientCaptureMessage() {
        const eventId = Sentry.captureMessage(
            'sentry-test: client captureMessage',
            'info',
        );
        setStatus({ kind: 'ok', msg: `captureMessage eventId=${eventId}` });
    }

    async function callServer(kind: string) {
        setStatus({ kind: 'ok', msg: `Calling /api/sentry-test?kind=${kind}…` });
        try {
            const res = await fetch(`/api/sentry-test?kind=${kind}`);
            const body = await res.text();
            setStatus({ kind: 'ok', msg: `HTTP ${res.status}: ${body.slice(0, 200)}` });
        } catch (err) {
            setStatus({
                kind: 'err',
                msg: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
            });
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={clientThrow}
                    className="rounded-md bg-secondary px-3 py-2 text-secondary-fg hover:opacity-90"
                >
                    Client: throw in handler
                </button>
                <button
                    type="button"
                    onClick={clientCaptureException}
                    className="rounded-md bg-primary px-3 py-2 text-primary-fg hover:opacity-90"
                >
                    Client: captureException
                </button>
                <button
                    type="button"
                    onClick={clientCaptureMessage}
                    className="rounded-md bg-primary px-3 py-2 text-primary-fg hover:opacity-90"
                >
                    Client: captureMessage
                </button>
            </div>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => callServer('exception')}
                    className="rounded-md border border-border-base px-3 py-2 hover:bg-surface"
                >
                    Server: throw (exception)
                </button>
                <button
                    type="button"
                    onClick={() => callServer('message')}
                    className="rounded-md border border-border-base px-3 py-2 hover:bg-surface"
                >
                    Server: captureMessage
                </button>
                <button
                    type="button"
                    onClick={() => callServer('unhandled')}
                    className="rounded-md border border-border-base px-3 py-2 hover:bg-surface"
                >
                    Server: unhandled rejection
                </button>
            </div>
            {status.kind !== 'idle' && (
                <pre
                    className={`whitespace-pre-wrap rounded-md border border-border-base p-3 text-sm ${status.kind === 'err' ? 'text-secondary' : 'text-fg'
                        }`}
                >
                    {status.msg}
                </pre>
            )}
        </div>
    );
}
