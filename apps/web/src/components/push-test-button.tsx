'use client';

/**
 * "Send test notification" — the user-facing half of the push self-test
 * (POSTs to `/api/notifications/test-push`). Surfaces exactly which layer
 * fails so "push doesn't work" becomes diagnosable in one click: server VAPID
 * config, a missing device subscription, or a per-device delivery error.
 */
import { useCallback, useState } from 'react';
import { neutralButtonClass } from '@/components/primary-button';

type TestResult = {
  ok: boolean;
  reason?: string;
  configured?: boolean;
  subscriptions?: number;
  delivered?: number;
  pruned?: number;
  hint?: string;
  results?: { endpoint: string; ok: boolean; statusCode?: number; message?: string }[];
};

export function PushTestButton() {
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<'ok' | 'err'>('ok');

  const run = useCallback(async () => {
    setWorking(true);
    setMsg(null);
    try {
      const res = await fetch('/api/notifications/test-push', { method: 'POST' });
      const data = (await res.json()) as TestResult;
      if (data.ok) {
        setTone('ok');
        setMsg(
          `Sent to ${data.delivered ?? 0} of ${data.subscriptions ?? 0} device(s). If nothing appears, check your OS notification settings — on a Mac, Focus / Do Not Disturb or System Settings → Notifications → your browser.`,
        );
      } else {
        setTone('err');
        if (data.reason === 'vapid-not-configured') {
          setMsg(`Server push keys aren't configured for this environment.`);
        } else if (data.reason === 'no-subscriptions') {
          setMsg(`No push subscription on this device yet — enable push above, then test.`);
        } else {
          const first = data.results?.find((r) => !r.ok);
          setMsg(
            `Delivery failed${first?.statusCode ? ` (${first.statusCode})` : ''}${
              first?.message ? `: ${first.message}` : ''
            }.`,
          );
        }
      }
    } catch (e) {
      setTone('err');
      setMsg(e instanceof Error ? e.message : 'request-failed');
    } finally {
      setWorking(false);
    }
  }, []);

  return (
    <div className="space-y-1">
      <button type="button" onClick={run} disabled={working} className={neutralButtonClass('sm')}>
        {working ? 'Sending…' : 'Send test notification'}
      </button>
      {msg ? (
        <p className={`text-xs ${tone === 'ok' ? 'text-muted' : 'text-md-error'}`}>{msg}</p>
      ) : null}
    </div>
  );
}
