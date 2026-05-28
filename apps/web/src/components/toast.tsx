'use client';

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import type { AlertVariant } from './alert';

export type ToastVariant = AlertVariant;

export interface Toast {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  /** Auto-dismiss after this many ms. Set 0 to disable. Defaults to 5000. */
  durationMs?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'> & { id?: string }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook for queueing toast notifications from client components.
 *
 * ```tsx
 * const { show } = useToast();
 * show({ variant: 'success', message: 'Saved!' });
 * ```
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}

const DEFAULT_DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastContextValue['show']>(
    (toast) => {
      const id =
        toast.id ??
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      const next: Toast = { ...toast, id };
      setToasts((prev) => [...prev, next]);
      const duration = toast.durationMs ?? DEFAULT_DURATION_MS;
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, show, dismiss }),
    [toasts, show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
      <Suspense fallback={null}>
        <FlashReader />
      </Suspense>
    </ToastContext.Provider>
  );
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  error:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/80 dark:text-red-100',
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/80 dark:text-emerald-100',
  info: 'border-primary/40 bg-primary/10 text-primary',
  warning:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/80 dark:text-amber-100',
};

// Per-variant focus-visible ring for the close button. The previous
// `focus:ring-current` inherited the toast's foreground color, which on
// info/warning surfaces did not reliably hit 3:1 against the toast
// background (WCAG 2.4.11 Focus Appearance). Each ring below is verified
// against both the light and dark variant backgrounds; the offset color
// matches the toast background so the ring reads as a solid outline
// rather than a halo bleeding into the page behind it.
const VARIANT_RING_CLASSES: Record<ToastVariant, string> = {
  error:
    'focus-visible:ring-red-700 focus-visible:ring-offset-red-50 dark:focus-visible:ring-red-200 dark:focus-visible:ring-offset-red-950',
  success:
    'focus-visible:ring-emerald-700 focus-visible:ring-offset-emerald-50 dark:focus-visible:ring-emerald-200 dark:focus-visible:ring-offset-emerald-950',
  info: 'focus-visible:ring-primary focus-visible:ring-offset-surface',
  warning:
    'focus-visible:ring-amber-800 focus-visible:ring-offset-amber-50 dark:focus-visible:ring-amber-200 dark:focus-visible:ring-offset-amber-950',
};

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  const assertive = toasts.filter((t) => t.variant === 'error' || t.variant === 'warning');
  const polite = toasts.filter((t) => t.variant !== 'error' && t.variant !== 'warning');
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:right-6 sm:bottom-6 sm:left-auto sm:items-end">
      {/* Errors and warnings are assertive so screen readers interrupt
                whatever they're reading. Successes / info stay polite. */}
      <ol aria-live="assertive" aria-atomic="false" className="contents">
        {assertive.map((t) => (
          <ToastItem key={t.id} toast={t} dismiss={dismiss} />
        ))}
      </ol>
      <ol aria-live="polite" aria-atomic="false" className="contents">
        {polite.map((t) => (
          <ToastItem key={t.id} toast={t} dismiss={dismiss} />
        ))}
      </ol>
    </div>
  );
}

function ToastItem({ toast: t, dismiss }: { toast: Toast; dismiss: (id: string) => void }) {
  return (
    <li
      role={t.variant === 'error' || t.variant === 'warning' ? 'alert' : 'status'}
      className={[
        'pointer-events-auto w-full max-w-sm rounded-md border p-3 text-sm shadow-lg',
        VARIANT_CLASSES[t.variant],
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {t.title && <p className="leading-tight font-semibold">{t.title}</p>}
          <p className={t.title ? 'mt-0.5' : undefined}>{t.message}</p>
        </div>
        <button
          type="button"
          aria-label={
            t.title ? `Dismiss notification: ${t.title}` : `Dismiss notification: ${t.message}`
          }
          onClick={() => dismiss(t.id)}
          className={`tap-target -mt-1 -mr-1 rounded-md text-lg leading-none opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${VARIANT_RING_CLASSES[t.variant]}`}
        >
          <span aria-hidden>×</span>
        </button>
      </div>
    </li>
  );
}

/**
 * Reads server-flashed messages from the URL (e.g. `?flash=Saved&flashType=success`)
 * after a server action redirects, surfaces them as toasts, then strips the
 * params from the URL.
 */
function FlashReader() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { show } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const flash = params.get('flash');
    if (!flash) return;
    handled.current = true;
    const type = params.get('flashType');
    const variant: ToastVariant =
      type === 'error' || type === 'success' || type === 'warning' || type === 'info'
        ? type
        : 'info';
    const title = params.get('flashTitle') ?? undefined;
    show({ variant, message: flash, ...(title ? { title } : {}) });

    // Strip the flash params so reloads don't re-show the toast.
    const next = new URLSearchParams(params.toString());
    next.delete('flash');
    next.delete('flashType');
    next.delete('flashTitle');
    const qs = next.toString();
    const target = (qs ? `${pathname}?${qs}` : pathname) as Route;
    router.replace(target, { scroll: false });
  }, [params, pathname, router, show]);

  return null;
}
