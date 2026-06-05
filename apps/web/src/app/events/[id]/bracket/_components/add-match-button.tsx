'use client';

import { FormModal, ModalActions } from '@/components/form-modal';
import { SubmitButton } from '@/components/submit-button';
import { neutralButtonClass, primaryButtonClass } from '@/components/primary-button';
import { bindBracketActions } from './bracket-action-binding';
import type { BracketScope, TeamLite } from './labels';

/**
 * "+ Add match" modal — appends a game to a pool (or the open stage) via the
 * scope-bound `addMatchFromForm` action. Used in the draft workspace **and** on
 * the live board (the domain allows adding matches while `active` too — e.g. a
 * host giving a pool an extra game mid-event). Works for event and standalone
 * scope (TT-11).
 */
export function AddMatchButton(props: {
  scope: BracketScope;
  pool?: string;
  teams: ReadonlyArray<TeamLite>;
  /** Override the trigger label (default "+ Add match"). */
  label?: string;
}) {
  const action = bindBracketActions(props.scope).addMatchFromForm;
  return (
    <FormModal
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="border-border-base text-fg/80 hover:bg-fg/5 rounded-md border border-dashed px-2.5 py-1 text-xs font-medium"
        >
          {props.label ?? '+ Add match'}
        </button>
      )}
      title={props.pool ? `Add a match to Pool ${props.pool}` : 'Add a match'}
      description="Pick the two teams. Useful for giving everyone an extra game; the same pairing can repeat."
    >
      {(close) => (
        <form action={action} className="space-y-3">
          {props.pool && <input type="hidden" name="pool" value={props.pool} />}
          <AddTeamSelect name="entry_a" label="Team A" teams={props.teams} />
          <AddTeamSelect name="entry_b" label="Team B" teams={props.teams} />
          <ModalActions
            dismissive={
              <button type="button" onClick={close} className={neutralButtonClass('sm')}>
                Cancel
              </button>
            }
            confirming={<SubmitButton className={primaryButtonClass('sm')}>Add match</SubmitButton>}
          />
        </form>
      )}
    </FormModal>
  );
}

function AddTeamSelect(props: { name: string; label: string; teams: ReadonlyArray<TeamLite> }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-fg/80">{props.label}</span>
      <select
        name={props.name}
        defaultValue="tbd"
        className="border-border-base bg-bg rounded border px-2 py-1"
      >
        <option value="tbd">— TBD —</option>
        {props.teams.map((t) => (
          <option key={t.entryId} value={t.entryId}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
