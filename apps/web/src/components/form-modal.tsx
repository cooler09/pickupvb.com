'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Modal dialog primitive built on `@radix-ui/react-dialog`.
 *
 * Bundle 6 (P2 #9 + P2 #14) rewrote this on Radix while preserving the
 * public API exactly — `<FormModal trigger title description size>`
 * with `children` as a node or `(close) => node` render-prop. All
 * three call sites
 * ([host-ad-hoc-teams-panel.tsx](../app/events/[id]/_components/host-ad-hoc-teams-panel.tsx),
 * [no-bracket-view.tsx](../app/events/[id]/bracket/_components/no-bracket-view.tsx),
 * [setup-view.tsx](../app/events/[id]/bracket/_components/setup-view.tsx))
 * needed zero edits.
 *
 * Why migrate off native `<dialog>`: Radix gives us a controlled
 * `open` boolean without the `useEffect`-bridge-to-`showModal()`
 * dance, real backdrop-click + Escape behaviour on every browser,
 * and `data-state` attributes we can animate via M3 motion tokens.
 *
 * What's new (M3 affordances per audit P2 #9 + P2 #14):
 * - **`icon` prop** renders an M3 dialog icon above the title
 *   (`text-md-primary`, centered).
 * - **`presentation` prop**: `'dialog'` (default — centered card),
 *   `'sheet'` (bottom sheet on every viewport), or `'auto'` (sheet
 *   below `sm`, dialog above). Sheet anchors to the bottom edge,
 *   full-width on mobile, with a drag-handle nub.
 * - **`<ModalActions>`** is the new M3 action-row primitive with
 *   named `destructive` / `dismissive` / `confirming` slots that
 *   handle M3's action ordering automatically. `<ModalFooter>` stays
 *   exported as the unstyled escape hatch already in use.
 */
export function FormModal({
  trigger,
  title,
  description,
  icon,
  children,
  size = 'md',
  presentation = 'dialog',
}: {
  /** Render-prop receiving the imperative `open` callback. */
  trigger: (open: () => void) => ReactNode;
  /** Modal heading. Wired to `aria-labelledby`. */
  title: string;
  /** Optional sub-copy under the heading. Wired to `aria-describedby`. */
  description?: ReactNode;
  /** Optional M3 dialog icon. Renders centered above the title. */
  icon?: ReactNode;
  /** Modal body. Render-prop receives `close` so the form can dismiss. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** `'md'` (default) = max-w-md, `'lg'` = max-w-xl for roomier forms. */
  size?: 'md' | 'lg';
  /**
   * `'dialog'` (default) centers a card on every viewport.
   * `'sheet'` anchors a bottom sheet on every viewport.
   * `'auto'` picks sheet below `sm` and dialog above.
   */
  presentation?: 'dialog' | 'sheet' | 'auto';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const widthClass = size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md';

  // Content positioning split:
  // - 'dialog': fixed, centered both axes, rounded card.
  // - 'sheet':  fixed, anchored to bottom edge, full-width, rounded
  //             only on the top corners; pb-safe for iOS notch.
  // - 'auto':   start as sheet, become dialog at `sm:` — single Radix
  //             <Content> with both class sets behind a responsive
  //             prefix.
  const positionClass =
    presentation === 'sheet'
      ? 'md-sheet-motion fixed inset-x-0 bottom-0 w-full rounded-t-shape-lg pb-safe'
      : presentation === 'auto'
        ? `md-sheet-motion sm:md-dialog-motion fixed inset-x-0 bottom-0 w-full rounded-t-shape-lg pb-safe sm:inset-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-shape-lg sm:pb-0 ${widthClass}`
        : `md-dialog-motion fixed top-1/2 left-1/2 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-shape-lg ${widthClass}`;

  return (
    <RadixDialog.Root open={isOpen} onOpenChange={setIsOpen}>
      {/*
       * The legacy public API hands `(open) => ReactNode` to the
       * caller and expects them to wire the imperative open callback
       * onto whatever element they choose (button, Link, styled div).
       * `display: contents` keeps the wrapper out of the layout so
       * existing styles aren't disturbed.
       */}
      <span style={{ display: 'contents' }}>{trigger(open)}</span>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="md-dialog-overlay fixed inset-0 z-50 bg-black/50" />
        <RadixDialog.Content
          className={`border-border-base bg-surface text-fg shadow-elevation-3 z-50 border p-0 ${positionClass}`}
        >
          {(presentation === 'sheet' || presentation === 'auto') && (
            <div
              aria-hidden="true"
              className={`flex justify-center pt-2 ${presentation === 'auto' ? 'sm:hidden' : ''}`}
            >
              <span className="bg-fg/20 h-1 w-10 rounded-full" />
            </div>
          )}
          <div className="max-h-[85vh] space-y-3 overflow-y-auto p-5">
            <header className="space-y-2">
              {icon && (
                <div className="text-md-primary flex justify-center" aria-hidden="true">
                  {icon}
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <RadixDialog.Title
                  className={`text-base font-semibold ${icon ? 'flex-1 text-center' : ''}`}
                >
                  {title}
                </RadixDialog.Title>
                <RadixDialog.Close
                  aria-label="Close"
                  className="tap-target text-fg/60 hover:text-fg state-layer -m-2 rounded-full text-lg leading-none"
                >
                  ×
                </RadixDialog.Close>
              </div>
              {description && (
                <RadixDialog.Description
                  className={`text-muted text-sm ${icon ? 'text-center' : ''}`}
                >
                  {description}
                </RadixDialog.Description>
              )}
            </header>
            {typeof children === 'function' ? children(close) : children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
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
 * `FormModal` body for the Cancel / Submit row. Kept for
 * backwards-compatibility with the two Bundle 128 call sites; prefer
 * `<ModalActions>` for new code so M3's action ordering is enforced
 * by the primitive.
 */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-2">{children}</div>;
}

/**
 * M3 dialog action row with named slots.
 *
 * M3 orders dialog actions:
 *   [destructive]  …flex spacer…  [dismissive] [confirming]
 *
 * - **destructive** (optional) — far left. "Delete", "Discard".
 * - **dismissive** (optional) — right cluster, leftmost. "Cancel".
 * - **confirming** (optional) — right cluster, rightmost (primary).
 *
 * On `<sm` everything wraps to a single `column-reverse` stack so the
 * primary action stays nearest the thumb.
 */
export function ModalActions({
  destructive,
  dismissive,
  confirming,
}: {
  destructive?: ReactNode;
  dismissive?: ReactNode;
  confirming?: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
      {destructive && <div className="sm:mr-auto">{destructive}</div>}
      {dismissive}
      {confirming}
    </div>
  );
}
