'use client';

import { SubmitButton } from '@/components/submit-button';
import { errorButtonClass } from '@/components/primary-button';

/**
 * Two-step "Delete bracket" danger zone for an event bracket (UX-15). Removing
 * the bracket cascades its seeding / schedule / results and returns the division
 * to format selection — the supported way to change format after create, and the
 * real "start over" the (removed) setup "Discard" only pretended to be.
 *
 * Event scope only: rendered from `SetupView` / `DraftWorkspace` when the bound
 * actions carry a `delete` (standalone brackets keep their own page-level delete
 * from TT-12, so they pass none and this doesn't appear). Mirrors the live
 * board's "Reset bracket" disclosure styling.
 */
export function DeleteBracketDanger({
  deleteAction,
}: {
  deleteAction: () => void | Promise<void>;
}) {
  return (
    <details className="text-xs">
      <summary className="border-md-error/40 text-md-error hover:bg-md-error/10 inline-block cursor-pointer rounded border px-2 py-1">
        Delete bracket
      </summary>
      <div className="border-md-error/30 bg-md-error/5 mt-2 max-w-prose space-y-2 rounded border p-3">
        <p className="text-md-error">
          Permanently removes this bracket — its seeding, schedule, and any recorded results. The
          division returns to format selection so you can start over (for example, to switch
          formats). This can{'’'}t be undone.
        </p>
        <form action={deleteAction}>
          <SubmitButton pendingChildren="Deleting…" className={errorButtonClass('sm')}>
            Delete bracket
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}
