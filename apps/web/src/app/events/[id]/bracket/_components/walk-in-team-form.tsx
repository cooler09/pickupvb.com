'use client';

import { useState } from 'react';
import { CloseOnSettled, ModalFooter } from '@/components/form-modal';
import { SubmitButton } from '@/components/submit-button';
import { addAdHocTeamFromForm } from '../actions';

/**
 * Host escape hatch for adding a walk-in / unregistered team to a
 * division's bracket. Captures team name + an optional starting roster
 * (player display name and contact email) so the host can record who's
 * actually on court without leaving the bracket page.
 *
 * Rows are managed client-side (variable length, add/remove buttons).
 * Empty player-name rows are skipped server-side, so the host can leave
 * extras blank.
 */
export function WalkInTeamForm(props: {
  eventId: string;
  divisionId: string;
  /**
   * Optional dismiss callback. When provided, the form renders a
   * Cancel button alongside Submit and closes itself after the server
   * action settles (success or failure). Set by `FormModal` consumers.
   */
  onSettled?: () => void;
}) {
  const [playerRows, setPlayerRows] = useState<number[]>([0, 1]);
  const inModal = !!props.onSettled;

  const addRow = () => {
    setPlayerRows((rows) => [...rows, (rows[rows.length - 1] ?? -1) + 1]);
  };

  const removeRow = (id: number) => {
    setPlayerRows((rows) => rows.filter((r) => r !== id));
  };

  return (
    <form
      action={addAdHocTeamFromForm.bind(null, props.eventId, props.divisionId)}
      className={
        inModal ? 'space-y-3' : 'border-border-base space-y-3 rounded-lg border border-dashed p-4'
      }
    >
      {inModal && props.onSettled && <CloseOnSettled onSettled={props.onSettled} />}
      {!inModal && (
        <div>
          <h3 className="text-fg text-sm font-semibold">Add a walk-in team</h3>
          <p className="text-muted text-xs">
            For teams not registered to this division. Created as an ad-hoc registration on this
            division — you can edit the roster later from the event’s team management page.
          </p>
        </div>
      )}

      <label className="block">
        <span className="text-fg/80 text-xs font-medium">Team name</span>
        <input
          type="text"
          name="team_name"
          required
          maxLength={80}
          placeholder="e.g. Walk-in Wonders"
          className="border-border-base bg-bg text-fg focus:border-primary focus:ring-primary mt-1 block w-full rounded border px-2 py-1 text-sm shadow-sm focus:ring-1 focus:outline-none"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-fg/80 text-xs font-medium">
          Players <span className="text-muted font-normal">(optional)</span>
        </legend>
        {playerRows.map((id, idx) => (
          <div key={id} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              name={`player_name_${idx}`}
              maxLength={80}
              placeholder={`Player ${idx + 1} name`}
              className="border-border-base bg-bg text-fg focus:border-primary focus:ring-primary block min-w-0 flex-1 rounded border px-2 py-1 text-sm shadow-sm focus:ring-1 focus:outline-none"
            />
            <input
              type="email"
              name={`player_email_${idx}`}
              maxLength={120}
              placeholder="email (optional)"
              className="border-border-base bg-bg text-fg focus:border-primary focus:ring-primary block min-w-0 flex-1 rounded border px-2 py-1 text-sm shadow-sm focus:ring-1 focus:outline-none"
            />
            {playerRows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(id)}
                aria-label={`Remove player ${idx + 1}`}
                className="border-border-base text-fg/60 hover:bg-fg/5 hover:text-fg rounded border px-2 py-1 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="border-border-base text-fg/80 hover:bg-fg/5 rounded border border-dashed px-2 py-1 text-xs"
        >
          + Add player
        </button>
      </fieldset>

      {inModal ? (
        <ModalFooter>
          <button
            type="button"
            onClick={props.onSettled}
            className="border-border-base text-fg/80 hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <SubmitButton
            pendingChildren="Adding…"
            className="bg-primary text-primary-fg rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            Add team
          </SubmitButton>
        </ModalFooter>
      ) : (
        <div>
          <SubmitButton className="border-border-base text-fg/80 hover:bg-fg/5 rounded border px-3 py-1 text-sm disabled:opacity-50">
            Add team
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
