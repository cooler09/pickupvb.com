'use client';

import { FormModal, ModalActions } from '@/components/form-modal';
import { SubmitButton } from '@/components/submit-button';
import {
  errorTextButtonClass,
  neutralButtonClass,
  primaryButtonClass,
} from '@/components/primary-button';
import { editBracketMatchFromForm, removeBracketMatch } from '../actions';
import type { TeamLite } from './labels';

/**
 * Host control for manually editing one match in a `draft` bracket (ADR 0032):
 * swap either team (or set "TBD"), set the court, and override the match length
 * (best-of + play-to) for just this match. Also removes the match.
 *
 * Plain `<form action>` submits to the flash-param redirect actions, so the
 * page re-renders (closing the modal) on completion — no client result state.
 */
export function MatchEditor(props: {
  eventId: string;
  divisionId: string;
  match: {
    id: string;
    entryAId: string | null;
    entryBId: string | null;
    court: string | null;
    bestOf: number | null;
    targetScore: number | null;
  };
  teams: ReadonlyArray<TeamLite>;
  /** Stage default best-of, shown as the "Default" option label. */
  defaultBestOf: number;
  /** Stage default target score, shown as the play-to placeholder. */
  defaultTargetScore: number | null;
  /** Whether removing this match is offered (draft only). */
  allowRemove?: boolean;
}) {
  const { match } = props;
  const edit = editBracketMatchFromForm.bind(null, props.eventId, props.divisionId, match.id);
  const remove = removeBracketMatch.bind(null, props.eventId, props.divisionId, match.id);

  return (
    <FormModal
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="text-primary text-xs font-medium hover:underline"
        >
          Edit
        </button>
      )}
      title="Edit match"
      description="Change the matchup, court, or match length for this game. Set a team to “TBD” to leave it open."
    >
      {(close) => (
        <div className="space-y-4">
          <form action={edit} className="space-y-3">
            <TeamSelect name="entry_a" label="Team A" value={match.entryAId} teams={props.teams} />
            <TeamSelect name="entry_b" label="Team B" value={match.entryBId} teams={props.teams} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg/80">Court</span>
              <input
                name="court"
                defaultValue={match.court ?? ''}
                placeholder="e.g. Court 1"
                className="border-border-base bg-bg rounded border px-2 py-1"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg/80">Best of</span>
                <select
                  name="best_of"
                  defaultValue={match.bestOf ?? ''}
                  className="border-border-base bg-bg rounded border px-2 py-1"
                >
                  <option value="">Default (best of {props.defaultBestOf})</option>
                  {[1, 3, 5].map((n) => (
                    <option key={n} value={n}>
                      Best of {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg/80">Play to</span>
                <input
                  type="number"
                  name="target_score"
                  min={1}
                  defaultValue={match.targetScore ?? ''}
                  placeholder={props.defaultTargetScore ? String(props.defaultTargetScore) : '—'}
                  className="border-border-base bg-bg w-24 rounded border px-2 py-1"
                />
              </label>
            </div>
            <ModalActions
              dismissive={
                <button type="button" onClick={close} className={neutralButtonClass('sm')}>
                  Cancel
                </button>
              }
              confirming={<SubmitButton className={primaryButtonClass('sm')}>Save</SubmitButton>}
            />
          </form>
          {props.allowRemove && (
            <form action={remove} className="border-border-base/60 border-t pt-3">
              <SubmitButton className={`${errorTextButtonClass('sm')} tap-target`}>
                Remove this match
              </SubmitButton>
            </form>
          )}
        </div>
      )}
    </FormModal>
  );
}

function TeamSelect(props: {
  name: string;
  label: string;
  value: string | null;
  teams: ReadonlyArray<TeamLite>;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-fg/80">{props.label}</span>
      <select
        name={props.name}
        defaultValue={props.value ?? 'tbd'}
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
