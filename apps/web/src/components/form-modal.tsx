'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Modal dialog primitive built on the native `<dialog>` element.
 *
 * Why a primitive instead of hand-rolling per-site: the codebase already
 * uses `<dialog>` in two places ([report-bug-button.tsx], [confirm-submit-button.tsx])
 * with subtly different markup and styling. This wraps that pattern so
 * disclosure forms that became "modal candidates" in the UX audit
 * (walk-in team, division edit, sponsor, etc.) share one consistent
 * accessible shell — backdrop, focus trap, Escape-to-close, and an
 * `aria-labelledby` heading wired up for free.
 *
 * Usage:
 *
 *   <FormModal
 *     trigger={(open) => (
 *       <button onClick={open} className={primaryButtonClass()}>
 *         + Add walk-in team
 *       </button>
 *     )}
 *     title="Add a walk-in team"
 *     description="For teams not registered to this division."
 *   >
 *     {(close) => (
 *       <form action={someAction}>
 *         <CloseOnSettled onSettled={close} />
 *         {fields}
 *         <ModalFooter>
 *           <button type="button" onClick={close}>Cancel</button>
 *           <SubmitButton>Add team</SubmitButton>
 *         </ModalFooter>
 *       </form>
 *     )}
 *   </FormModal>
 *
 * `children` can be a node or a `(close) => node` render-prop so the
 * form can dismiss itself (Cancel button, success handler, …).
 */
export function FormModal({
  trigger,
  title,
  description,
  children,
  size = 'md',
}: {
  /** Render-prop receiving the imperative `open` callback. */
  trigger: (open: () => void) => ReactNode;
  /** Modal heading. Wired to `aria-labelledby`. */
  title: string;
  /** Optional sub-copy under the heading. Wired to `aria-describedby`. */
  description?: ReactNode;
  /** Modal body. Render-prop receives `close` so the form can dismiss. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** `'md'` (default) = max-w-md, `'lg'` = max-w-xl for roomier forms. */
  size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  // Drive `<dialog>` from React state so the `open` / `close` callbacks
  // we hand to consumers don't dereference `ref.current` synchronously
  // during render — the `react-hooks/refs` lint rule rejects that
  // pattern even when the call site is an effect or event handler.
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Imperative bridge: native `<dialog>` doesn't expose an `open` prop
  // that takes a controlled boolean (the `open` attribute opens it as a
  // non-modal element, which loses the backdrop + focus trap). Drive
  // `showModal()` / `close()` from an effect instead.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen && !el.open) el.showModal();
    else if (!isOpen && el.open) el.close();
  }, [isOpen]);

  // Sync browser-initiated dismissal (Escape, backdrop click in
  // supporting browsers) back into our state so the next `open()` call
  // works.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => setIsOpen(false);
    el.addEventListener('close', handler);
    return () => el.removeEventListener('close', handler);
  }, []);

  const widthClass = size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md';

  return (
    <>
      {trigger(open)}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        {...(description ? { 'aria-describedby': descId } : {})}
        className={`border-border-base bg-surface text-fg m-auto w-full ${widthClass} rounded-lg border p-0 shadow-xl backdrop:bg-black/50`}
      >
        <div className="max-h-[85vh] space-y-3 overflow-y-auto p-5">
          <header className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="tap-target text-fg/60 hover:text-fg -m-2 rounded text-lg leading-none"
              >
                ×
              </button>
            </div>
            {description && (
              <p id={descId} className="text-muted text-sm">
                {description}
              </p>
            )}
          </header>
          {typeof children === 'function' ? children(close) : children}
        </div>
      </dialog>
    </>
  );
}

/**
 * Drop-in helper for forms rendered inside a `FormModal`. Watches the
 * surrounding form's `useFormStatus().pending` state and fires
 * `onSettled` when the action transitions back from pending → idle —
 * i.e. when the server action has completed (success or failure).
 *
 * For the modal use case "close when the action finishes" is what every
 * caller wants. Errors today are surfaced via `redirect()` + flash
 * params, so closing on failure doesn't drop information that's
 * displayed inside the modal. If we add inline error state per-form
 * later, swap this for a `useFormState`-driven success branch.
 *
 * Must be rendered as a child of a `<form>` to read its status.
 */
export function CloseOnSettled({ onSettled }: { onSettled: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      onSettled();
    }
  }, [pending, onSettled]);
  return null;
}

/**
 * Right-aligned button row with consistent spacing. Use inside a
 * `FormModal` body for the Cancel / Submit row.
 */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-2">{children}</div>;
}
