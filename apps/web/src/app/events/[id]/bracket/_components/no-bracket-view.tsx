'use client';

import { FormModal } from '@/components/form-modal';
import { primaryButtonClass } from '@/components/primary-button';
import { eventScope } from './bracket-action-binding';
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
    <section className="border-border-base bg-fg/5 rounded-shape-sm space-y-4 border p-4">
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
      {/* Walk-in escape hatch lives in a modal so the host can register
          walk-in teams without the format picker scrolling behind them.
          The modal stays open across adds (see WalkInTeamForm) so a host
          can enter a handful at check-in. When `!ready` the trigger is
          promoted to a primary CTA since it's the unblocking action. */}
      <div className="flex justify-start">
        <FormModal
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className={
                ready
                  ? 'border-border-base text-fg/80 hover:bg-fg/5 rounded-md border border-dashed px-3 py-1.5 text-sm font-medium'
                  : primaryButtonClass('sm')
              }
            >
              + Add walk-in teams
            </button>
          )}
          title="Add walk-in teams"
          description="For teams not registered to this division. Add as many as you need — the modal stays open after each. You can edit rosters later from the event's team management page."
        >
          {(close) => (
            <WalkInTeamForm scope={eventScope(props.eventId, props.divisionId)} onClose={close} />
          )}
        </FormModal>
      </div>
    </section>
  );
}
