'use client';

import { useFormStatus } from 'react-dom';
import { useId, useRef, useState } from 'react';
import {
  errorButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/primary-button';

/**
 * Submit button that asks for confirmation before posting its parent form.
 * Shows an in-app modal (native `<dialog>`) instead of the browser's
 * `window.confirm` so the experience matches the rest of the app.
 */
export function ConfirmSubmitButton({
  label,
  pendingLabel,
  confirmMessage,
  confirmTitle,
  confirmLabel,
  cancelLabel,
  destructive,
  className,
}: {
  label: string;
  pendingLabel: string;
  confirmMessage: string;
  /** Optional heading inside the modal. Defaults to the button label. */
  confirmTitle?: string;
  /** Label for the confirm action button. Defaults to the trigger label. */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Render the confirm button in a destructive (red) style. */
  destructive?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const [confirmed, setConfirmed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const titleId = useId();
  const descId = useId();

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (confirmed) return; // already confirmed — let the submit proceed
    e.preventDefault();
    formRef.current = e.currentTarget.form;
    dialogRef.current?.showModal();
  }

  function handleCancel() {
    dialogRef.current?.close();
  }

  function handleConfirm() {
    dialogRef.current?.close();
    setConfirmed(true);
    // Defer to next tick so React commits the new state before we
    // re-trigger submission.
    queueMicrotask(() => {
      formRef.current?.requestSubmit();
    });
  }

  // Non-destructive confirm uses the canonical filled CTA; destructive uses
  // the canonical filled error button (M3 `error` role tokens). Both share the
  // same `md` shape so the modal action row lines up.
  const confirmBtnClass = destructive ? errorButtonClass('md') : primaryButtonClass('md');

  return (
    <>
      <button
        type="submit"
        disabled={pending}
        onClick={handleClick}
        className={className ?? primaryButtonClass('md')}
      >
        {pending ? pendingLabel : label}
      </button>

      <dialog
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="border-border-base bg-surface text-fg rounded-shape-sm m-auto w-full max-w-sm border p-0 shadow-xl backdrop:bg-black/50"
      >
        <div className="space-y-3 p-5">
          <h2 id={titleId} className="text-base font-semibold">
            {confirmTitle ?? label}
          </h2>
          <p id={descId} className="text-muted text-sm">
            {confirmMessage}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className={secondaryButtonClass('md')}
              {...(destructive ? { autoFocus: true } : {})}
            >
              {cancelLabel ?? 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={confirmBtnClass}
              {...(destructive ? {} : { autoFocus: true })}
            >
              {confirmLabel ?? label}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
