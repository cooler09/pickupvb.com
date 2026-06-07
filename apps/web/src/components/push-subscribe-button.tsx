'use client';

/**
 * Browser push enable/disable button.
 *
 * Flow:
 *  1. Register `/sw.js` if not already.
 *  2. Request `Notification.permission` if not granted.
 *  3. `pushManager.subscribe()` with the VAPID public key.
 *  4. POST `{ endpoint, keys }` to `/api/notifications/subscribe`.
 *
 * Unsubscribe goes the other way: pull the existing subscription, call
 * `unsubscribe()` on it, then DELETE the row server-side.
 *
 * The component starts in "unknown" state and asks the SW for the current
 * subscription on mount, so it can show the right CTA without flashing.
 */
import { useCallback, useEffect, useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';

type State = 'unknown' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' | 'working';

/**
 * iOS only exposes the Push API to an **installed** PWA (Add to Home Screen),
 * never to a Safari tab. Detect that case so we can show actionable guidance
 * instead of a flat "not supported".
 */
function isIosNeedsInstall(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS reports as Mac; disambiguate by touch support.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return !standalone;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushSubscribeButton({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>('unknown');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!vapidPublicKey) {
        if (!cancelled) setState('unsupported');
        return;
      }
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        if (!cancelled) setState(isIosNeedsInstall() ? 'ios-install' : 'unsupported');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (Notification.permission === 'denied') {
          setState('denied');
          return;
        }
        setState(existing ? 'on' : 'off');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'sw-register-failed');
          setState('unsupported');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  const subscribe = useCallback(async () => {
    if (!vapidPublicKey) return;
    setState('working');
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const body = sub.toJSON();
      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`save-failed-${res.status}`);
      setState('on');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'subscribe-failed');
      setState('off');
    }
  }, [vapidPublicKey]);

  const unsubscribe = useCallback(async () => {
    setState('working');
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/notifications/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: 'DELETE',
        });
        await sub.unsubscribe();
      }
      setState('off');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unsubscribe-failed');
      setState('on');
    }
  }, []);

  if (state === 'unknown') {
    return <p className="text-muted text-xs">Checking browser support…</p>;
  }
  if (state === 'unsupported') {
    return (
      <p className="text-muted text-xs">
        Push notifications aren&apos;t supported in this browser
        {!vapidPublicKey ? ' (server VAPID key not configured)' : ''}.
      </p>
    );
  }
  if (state === 'ios-install') {
    return (
      <p className="text-muted text-xs">
        On iPhone &amp; iPad, push works only after you install PickupVB: tap the Share button, then{' '}
        <span className="font-medium">Add to Home Screen</span>. Open the app from your home screen
        and you&apos;ll be able to enable push here.
      </p>
    );
  }
  if (state === 'denied') {
    return (
      <p className="text-muted text-xs">
        You&apos;ve blocked notifications for this site. Re-enable them in your browser settings,
        then reload this page.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {state === 'on' ? (
        <button
          type="button"
          onClick={unsubscribe}
          className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          Disable push on this device
        </button>
      ) : (
        <button
          type="button"
          onClick={subscribe}
          disabled={state === 'working'}
          className={primaryButtonClass('sm')}
        >
          {state === 'working' ? 'Working…' : 'Enable push on this device'}
        </button>
      )}
      {error ? <p className="text-md-error text-xs">{error}</p> : null}
    </div>
  );
}
