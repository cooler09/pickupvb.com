'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { primaryButtonClass, errorButtonClass, textButtonClass } from '@/components/primary-button';
import { fieldInputClass, fieldSubLabelClass } from '@/components/field-styles';

/**
 * Controlled confirm dialog on `@radix-ui/react-dialog` — the styled,
 * focus-trapped, M3 replacement for `window.confirm` (audit MU-5). Unlike
 * {@link FormModal} (trigger-driven), this is opened imperatively via the `open`
 * prop so a caller can confirm a per-row action. Shares the same overlay /
 * motion / surface tokens as `FormModal`.
 *
 * Optionally renders a short reason textarea (`reason` prop) whose value is
 * handed to `onConfirm` — used by the chat "Report" flow to collect the
 * previously-always-null moderator note (audit MU-14). `onConfirm` receives the
 * trimmed reason or `null`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  reason,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (error role). */
  danger?: boolean;
  /** When set, renders an optional reason textarea passed to `onConfirm`. */
  reason?: { label: string; placeholder?: string };
  onConfirm: (reason: string | null) => void;
}) {
  const [reasonText, setReasonText] = useState('');
  const confirmClass = danger ? errorButtonClass('sm') : primaryButtonClass('sm');

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setReasonText('');
        onOpenChange(next);
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="md-dialog-overlay fixed inset-0 z-50 bg-black/50" />
        <RadixDialog.Content className="md-dialog-motion border-border-base bg-md-surface-container-high text-fg shadow-elevation-3 rounded-shape-lg fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 border p-5">
          <div className="space-y-3">
            <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="text-muted text-sm">
                {description}
              </RadixDialog.Description>
            )}
            {reason && (
              <div className="space-y-1">
                <label className={fieldSubLabelClass} htmlFor="confirm-reason">
                  {reason.label}
                </label>
                <textarea
                  id="confirm-reason"
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  rows={2}
                  maxLength={300}
                  {...(reason.placeholder ? { placeholder: reason.placeholder } : {})}
                  className={fieldInputClass}
                />
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
              <RadixDialog.Close className={textButtonClass('sm')}>{cancelLabel}</RadixDialog.Close>
              <button
                type="button"
                onClick={() => onConfirm(reasonText.trim() || null)}
                className={confirmClass}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
