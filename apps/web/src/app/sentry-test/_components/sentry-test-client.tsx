'use client';

import { useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
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
    const eventId = Sentry.captureException(new Error('sentry-test: client captureException'));
    setStatus({ kind: 'ok', msg: `captureException eventId=${eventId}` });
  }

  function clientCaptureMessage() {
    const eventId = Sentry.captureMessage('sentry-test: client captureMessage', 'info');
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
          className="bg-secondary text-secondary-fg rounded-md px-3 py-2 hover:opacity-90"
        >
          Client: throw in handler
        </button>
        <button type="button" onClick={clientCaptureException} className={primaryButtonClass('md')}>
          Client: captureException
        </button>
        <button type="button" onClick={clientCaptureMessage} className={primaryButtonClass('md')}>
          Client: captureMessage
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => callServer('exception')}
          className="border-border-base hover:bg-md-surface-container rounded-md border px-3 py-2"
        >
          Server: throw (exception)
        </button>
        <button
          type="button"
          onClick={() => callServer('message')}
          className="border-border-base hover:bg-md-surface-container rounded-md border px-3 py-2"
        >
          Server: captureMessage
        </button>
        <button
          type="button"
          onClick={() => callServer('unhandled')}
          className="border-border-base hover:bg-md-surface-container rounded-md border px-3 py-2"
        >
          Server: unhandled rejection
        </button>
      </div>
      {status.kind !== 'idle' && (
        <pre
          className={`border-border-base rounded-md border p-3 text-sm whitespace-pre-wrap ${
            status.kind === 'err' ? 'text-secondary' : 'text-fg'
          }`}
        >
          {status.msg}
        </pre>
      )}
    </div>
  );
}
