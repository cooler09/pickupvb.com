'use client';

import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import type { Route } from 'next';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import * as RadixDialog from '@radix-ui/react-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { primaryButtonClass, textButtonClass } from '@/components/primary-button';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { sendEventBroadcast } from '@/app/events/[id]/broadcast-actions';
import { cancelEventFromDashboard } from '../_actions';

const itemClass =
  'state-layer data-[highlighted]:bg-fg/5 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm outline-none';

/**
 * Per-event quick-actions menu for the host dashboard. A Radix `DropdownMenu`
 * (same primitive as the nav dropdown) over a `⋯` trigger, surfacing the common
 * host tasks inline so the host doesn't have to bounce to `/events/[id]/manage`
 * for everything. The two dialogs (message / cancel) are rendered **outside**
 * the menu and driven by local state, so closing the menu doesn't unmount them.
 *
 * Takes only serializable props — no functions cross the RSC boundary, so the
 * server-rendered events tables can render it directly.
 */
export function EventActionsMenu({
  eventId,
  title,
  isUpcoming,
  isCancelled,
  attendeeCount,
}: {
  eventId: string;
  title: string;
  isUpcoming: boolean;
  isCancelled: boolean;
  attendeeCount: number;
}) {
  const { show } = useToast();
  const [dialog, setDialog] = useState<null | 'message' | 'cancel'>(null);
  const [pendingCancel, startCancel] = useTransition();

  const canMessage = isUpcoming && !isCancelled && attendeeCount > 0;
  const canCancel = isUpcoming && !isCancelled;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/events/${eventId}`);
      show({ variant: 'success', message: 'Event link copied' });
    } catch {
      show({ variant: 'error', message: 'Could not copy the link' });
    }
  }

  function handleCancel(reason: string | null) {
    startCancel(async () => {
      try {
        const res = await cancelEventFromDashboard(eventId, reason);
        if (res?.error) show({ variant: 'error', message: res.error });
        // On success the action redirects to the event page — navigation
        // takes over and this component unmounts.
      } catch {
        // A thrown NEXT_REDIRECT signal means the framework is navigating; ignore.
      } finally {
        setDialog(null);
      }
    });
  }

  return (
    <>
      <RadixDropdownMenu.Root>
        <RadixDropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${title}`}
            className="tap-target text-muted hover:text-fg inline-flex items-center justify-center rounded"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="12" cy="19" r="1.7" />
            </svg>
          </button>
        </RadixDropdownMenu.Trigger>
        <RadixDropdownMenu.Portal>
          <RadixDropdownMenu.Content
            align="end"
            sideOffset={6}
            aria-label={`Actions for ${title}`}
            className="md-menu-motion border-border-base bg-md-surface-container-high text-fg shadow-elevation-2 z-50 min-w-[12rem] overflow-hidden rounded-md border py-1"
          >
            <RadixDropdownMenu.Item asChild>
              <Link href={`/events/${eventId}/manage` as Route} className={itemClass}>
                Manage
              </Link>
            </RadixDropdownMenu.Item>
            <RadixDropdownMenu.Item asChild>
              <Link href={`/events/${eventId}/edit` as Route} className={itemClass}>
                Edit details
              </Link>
            </RadixDropdownMenu.Item>
            <RadixDropdownMenu.Item asChild>
              <Link href={`/events/new?from=${eventId}` as Route} className={itemClass}>
                Host again
              </Link>
            </RadixDropdownMenu.Item>

            <RadixDropdownMenu.Separator className="bg-border-base my-1 h-px" />

            {canMessage && (
              <RadixDropdownMenu.Item className={itemClass} onSelect={() => setDialog('message')}>
                Message attendees
              </RadixDropdownMenu.Item>
            )}
            <RadixDropdownMenu.Item className={itemClass} onSelect={() => void handleCopy()}>
              Copy event link
            </RadixDropdownMenu.Item>
            {attendeeCount > 0 && (
              <RadixDropdownMenu.Item asChild>
                <a href={`/api/events/${eventId}/attendees.csv`} download className={itemClass}>
                  Download roster (CSV)
                </a>
              </RadixDropdownMenu.Item>
            )}

            {canCancel && (
              <>
                <RadixDropdownMenu.Separator className="bg-border-base my-1 h-px" />
                <RadixDropdownMenu.Item
                  className={`${itemClass} text-md-error`}
                  onSelect={() => setDialog('cancel')}
                >
                  Cancel event
                </RadixDropdownMenu.Item>
              </>
            )}
          </RadixDropdownMenu.Content>
        </RadixDropdownMenu.Portal>
      </RadixDropdownMenu.Root>

      <MessageDialog
        eventId={eventId}
        title={title}
        attendeeCount={attendeeCount}
        open={dialog === 'message'}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(next) => {
          if (!next && !pendingCancel) setDialog(null);
        }}
        title={`Cancel "${title}"?`}
        description="Attendees are notified and paid tickets are refunded. This can't be undone."
        confirmLabel={pendingCancel ? 'Cancelling…' : 'Cancel event'}
        cancelLabel="Keep event"
        danger
        reason={{ label: 'Reason (optional)', placeholder: 'Shared with attendees in the notice' }}
        onConfirm={handleCancel}
      />
    </>
  );
}

/** Broadcast form in a controlled dialog. Reuses `sendEventBroadcast`, which
 *  redirects to the event page on success (so we don't manage a success state
 *  here — navigation closes the dialog). */
function MessageDialog({
  eventId,
  title,
  attendeeCount,
  open,
  onClose,
}: {
  eventId: string;
  title: string;
  attendeeCount: number;
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState(
    sendEventBroadcast.bind(null, eventId),
    {} as {
      ok?: boolean;
      error?: string;
    },
  );
  const errorRef = useAlertReveal(state, Boolean(state.error));

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="md-dialog-overlay fixed inset-0 z-50 bg-black/50" />
        <RadixDialog.Content className="md-dialog-motion border-border-base bg-md-surface-container-high text-fg shadow-elevation-3 rounded-shape-lg fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border p-5">
          <RadixDialog.Title className="text-base font-semibold">
            Message attendees
          </RadixDialog.Title>
          <RadixDialog.Description className="text-muted mt-1 text-sm">
            Sends to all {attendeeCount} attendees of {title} by email + in-app.
          </RadixDialog.Description>
          <form action={formAction} className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="dash-broadcast-subject"
                className="text-muted mb-1 block text-xs font-medium"
              >
                Subject (optional)
              </label>
              <input
                id="dash-broadcast-subject"
                name="subject"
                type="text"
                maxLength={120}
                placeholder="Important update"
                className="border-border-base bg-bg w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="dash-broadcast-body"
                className="text-muted mb-1 block text-xs font-medium"
              >
                Message
              </label>
              <textarea
                id="dash-broadcast-body"
                name="body"
                required
                rows={5}
                maxLength={2000}
                placeholder="Heads up — we moved to court 3."
                className="border-border-base bg-bg w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            {state.error && (
              <p
                ref={errorRef}
                tabIndex={-1}
                className="text-md-error text-sm outline-none"
                role="alert"
              >
                {state.error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
              <RadixDialog.Close className={textButtonClass('sm')}>Close</RadixDialog.Close>
              <SendButton />
            </div>
          </form>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('sm')}>
      {pending ? 'Sending…' : 'Send message'}
    </button>
  );
}
