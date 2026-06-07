'use client';

import * as RadixToast from '@radix-ui/react-toast';
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

/**
 * Optional action button (M3 Snackbar action slot). The `altText` is what
 * assistive tech announces when the action becomes available — Radix
 * requires it.
 */
export interface ToastAction {
  /** Visible button label (e.g. "Retry", "Undo"). */
  label: string;
  /** Alt text announced by screen readers. Default = `label`. */
  altText?: string;
  /** Click handler. The toast auto-dismisses after the handler runs. */
  onClick: () => void;
}

export interface Toast {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  /**
   * Override auto-dismiss in ms. Set 0 to disable (persistent — the user
   * must dismiss). When unset, the duration follows M3 Snackbar rules:
   * 10 000 ms for errors, 6 000 ms when an action is present, otherwise
   * 5 000 ms.
   */
  durationMs?: number;
  /** Optional M3 action affordance — adds a labeled button (e.g. "Retry"). */
  action?: ToastAction;
}

interface ToastContextValue {
  /**
   * Snapshot of pending toasts. Index 0 (if present) is the currently
   * visible toast; the rest are queued. Kept on the context so test
   * harnesses can assert queue depth without touching the DOM.
   */
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
 * show({
 *   variant: 'error',
 *   message: "Couldn't save",
 *   action: { label: 'Retry', onClick: save },
 * });
 * ```
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}

/**
 * M3-aligned default duration: errors stay longer because they often
 * carry recovery actions or critical context; toasts with an action
 * stay longer than informational ones so the user has time to react.
 */
function defaultDurationMs(t: Pick<Toast, 'variant' | 'action'>): number {
  if (t.variant === 'error') return 10_000;
  if (t.action) return 6_000;
  return 5_000;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  // Queue of pending toasts. Index 0 is the visible toast — M3 Snackbar
  // shows one at a time and queues the rest. Errors and warnings still
  // wait in line; their urgency comes from the `foreground` Radix type
  // (assertive aria-live), not from stacking.
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastContextValue['show']>((toast) => {
    const id =
      toast.id ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const next: Toast = { ...toast, id };
    setToasts((prev) => [...prev, next]);
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, show, dismiss }),
    [toasts, show, dismiss],
  );

  const head = toasts[0];

  return (
    <ToastContext.Provider value={value}>
      {/*
       * Radix sets a default duration on every Toast via the Provider; we
       * override per-toast with `duration` on the Root below, which makes
       * the Provider default unused in practice. We still set a sane
       * baseline so any Radix-managed dismiss path lines up with the M3
       * standard.
       */}
      <RadixToast.Provider swipeDirection="right" duration={5000}>
        {children}
        {head ? <ToastItem key={head.id} toast={head} dismiss={dismiss} /> : null}
        <RadixToast.Viewport className="pb-safe pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto flex w-full max-w-sm flex-col items-center gap-2 px-4 outline-none sm:right-6 sm:bottom-6 sm:left-auto sm:mx-0 sm:items-end" />
        <Suspense fallback={null}>
          <FlashReader />
        </Suspense>
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

// M3 container roles — bg = `{role}-container`, text = `on-{role}-container`.
// The tokens carry light/dark values (globals.css), so the hand-rolled `dark:`
// forks are gone. `warning`/`success` are the custom semantic roles from S2.
const VARIANT_CLASSES: Record<ToastVariant, string> = {
  error: 'border-md-error/40 bg-md-error-container text-md-on-error-container',
  success: 'border-md-success/40 bg-md-success-container text-md-on-success-container',
  // info uses brand tokens (not raw palette) — left as-is; not an S2 target.
  info: 'border-primary/40 bg-primary/10 text-primary',
  warning: 'border-md-warning/40 bg-md-warning-container text-md-on-warning-container',
};

// Per-variant focus-visible ring for the close + action buttons. The
// previous `focus:ring-current` inherited the toast's foreground color,
// which on info/warning surfaces did not reliably hit 3:1 against the
// toast background (WCAG 2.4.11 Focus Appearance). The role color
// (`ring-md-{role}`, tone 40 light / tone 80 dark) contrasts against the
// `{role}-container` background (tone 90 / tone 30) in both themes by
// construction, and the offset matches that container so the ring reads as a
// solid outline — so the light/dark fork collapses to one declaration.
const VARIANT_RING_CLASSES: Record<ToastVariant, string> = {
  error: 'focus-visible:ring-md-error focus-visible:ring-offset-md-error-container',
  success: 'focus-visible:ring-md-success focus-visible:ring-offset-md-success-container',
  info: 'focus-visible:ring-primary focus-visible:ring-offset-surface',
  warning: 'focus-visible:ring-md-warning focus-visible:ring-offset-md-warning-container',
};

function ToastItem({ toast: t, dismiss }: { toast: Toast; dismiss: (id: string) => void }) {
  // Errors / warnings render as Radix `foreground` toasts → role="alert"
  // + aria-live="assertive". Info / success render as `background` →
  // role="status" + aria-live="polite". Matches the previous behavior of
  // the hand-rolled <ol aria-live> split.
  const radixType: RadixToast.ToastProps['type'] =
    t.variant === 'error' || t.variant === 'warning' ? 'foreground' : 'background';
  const duration = t.durationMs ?? defaultDurationMs(t);

  return (
    <RadixToast.Root
      type={radixType}
      duration={duration === 0 ? Number.POSITIVE_INFINITY : duration}
      onOpenChange={(open) => {
        if (!open) dismiss(t.id);
      }}
      className={[
        'pointer-events-auto w-full max-w-sm rounded-md border p-3 text-sm shadow-lg',
        'md-toast-motion',
        VARIANT_CLASSES[t.variant],
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {t.title && (
            <RadixToast.Title className="leading-tight font-semibold">{t.title}</RadixToast.Title>
          )}
          <RadixToast.Description className={t.title ? 'mt-0.5' : undefined}>
            {t.message}
          </RadixToast.Description>
        </div>
        {t.action && (
          <RadixToast.Action asChild altText={t.action.altText ?? t.action.label}>
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
              className={`shrink-0 rounded-md border border-current/30 px-2 py-1 text-xs font-semibold tracking-wide uppercase hover:bg-current/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${VARIANT_RING_CLASSES[t.variant]}`}
            >
              {t.action.label}
            </button>
          </RadixToast.Action>
        )}
        <RadixToast.Close
          aria-label={
            t.title ? `Dismiss notification: ${t.title}` : `Dismiss notification: ${t.message}`
          }
          className={`tap-target -mt-1 -mr-1 rounded-md text-lg leading-none opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${VARIANT_RING_CLASSES[t.variant]}`}
        >
          <span aria-hidden>×</span>
        </RadixToast.Close>
      </div>
    </RadixToast.Root>
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
