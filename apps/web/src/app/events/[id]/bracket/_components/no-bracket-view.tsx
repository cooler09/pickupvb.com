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
            : 'You need at least 2 teams. Use “Add a walk-in team” below to register an unrostered team, or wait for more registrations.'}
        </p>
      </div>
      <FormatPickerForm
        eventId={props.eventId}
        divisionId={props.divisionId}
        teamCount={props.teamCount}
      />
      {/* Walk-in escape hatch is collapsed by default once there are enough
          registered teams (the format picker is the primary CTA). When the
          host can't generate yet, it auto-opens so the unblocking action is
          obvious. Once the bracket is created the same form lives in
          `SetupView` alongside the seeding list. */}
      <details open={!ready} className="border-border-base rounded-lg border border-dashed">
        <summary className="text-fg/80 hover:bg-fg/5 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium">
          Add a walk-in team
        </summary>
        <div className="border-border-base border-t p-3">
          <WalkInTeamForm eventId={props.eventId} divisionId={props.divisionId} />
        </div>
      </details>
    </section>
  );
}
