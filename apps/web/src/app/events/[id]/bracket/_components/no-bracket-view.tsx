'use client';

import { FormModal } from '@/components/form-modal';
import { FormatPickerForm } from './format-picker-form';
import { WalkInTeamForm } from './walk-in-team-form';

export function NoBracketView(props: {
  eventId: string;
  divisionId: string;
  teamCount: number;
  isHost: boolean;
}) {
  if (!props.isHost) {
    return (
      <p className="text-muted text-sm">
        The host hasn{'’'}t created a bracket for this tournament yet.
      </p>
    );
  }
  const ready = props.teamCount >= 2;
  return (
    <section className="border-border-base bg-fg/5 space-y-4 rounded-lg border p-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-fg text-lg font-semibold">Create bracket</h2>
          <span
            className={
              'rounded-full px-2 py-0.5 text-xs font-medium ' +
              (ready
                ? 'bg-green-500/15 text-green-700 dark:text-green-300'
                : 'bg-amber-500/15 text-amber-800 dark:text-amber-200')
            }
          >
            {props.teamCount} team{props.teamCount === 1 ? '' : 's'} registered
            {ready ? ' · ready' : ' · need ≥ 2'}
          </span>
        </div>
        <p className="text-muted text-sm">
          {ready
            ? 'Pick a format below, then click Create bracket. You can change format (by resetting) before any matches are played.'
            : 'You need at least 2 teams. Use “Add a walk-in team” to register an unrostered team, or wait for more registrations.'}
        </p>
      </div>
      <FormatPickerForm
        eventId={props.eventId}
        divisionId={props.divisionId}
        teamCount={props.teamCount}
      />
      {/* Walk-in escape hatch lives in a modal so the host can focus on
          registering one team without the format picker scrolling behind
          them. When `!ready` the trigger is promoted to a primary CTA
          since it's the unblocking action. */}
      <div className="flex justify-start">
        <FormModal
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className={
                ready
                  ? 'border-border-base text-fg/80 hover:bg-fg/5 rounded-md border border-dashed px-3 py-1.5 text-sm font-medium'
                  : 'bg-primary text-primary-fg inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm hover:opacity-90'
              }
            >
              + Add a walk-in team
            </button>
          )}
          title="Add a walk-in team"
          description="For teams not registered to this division. Created as an ad-hoc registration — you can edit the roster later from the event's team management page."
        >
          {(close) => (
            <WalkInTeamForm
              eventId={props.eventId}
              divisionId={props.divisionId}
              onSettled={close}
            />
          )}
        </FormModal>
      </div>
    </section>
  );
}
