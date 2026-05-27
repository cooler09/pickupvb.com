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
  return (
    <section className="border-border-base bg-fg/5 space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h2 className="text-fg text-lg font-semibold">Create bracket</h2>
        <p className="text-muted text-sm">
          Pick a format. You can change it (by resetting) before any matches are played.
        </p>
      </div>
      <FormatPickerForm
        eventId={props.eventId}
        divisionId={props.divisionId}
        teamCount={props.teamCount}
      />
      {/* Walk-in escape hatch is available here too — hosts often need to
          add a team or two before the format picker has enough registered
          teams to enable. Once the bracket is created the same form lives
          in `SetupView` alongside the seeding list. */}
      <WalkInTeamForm eventId={props.eventId} divisionId={props.divisionId} />
    </section>
  );
}
