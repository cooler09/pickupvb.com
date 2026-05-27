import { FormatPickerForm } from './format-picker-form';

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
    <section className="border-border-base bg-fg/5 space-y-3 rounded-lg border p-4">
      <h2 className="text-fg text-lg font-semibold">Create bracket</h2>
      <p className="text-muted text-sm">
        Pick a format. You can change it (by resetting) before any matches are played.
      </p>
      <FormatPickerForm
        eventId={props.eventId}
        divisionId={props.divisionId}
        teamCount={props.teamCount}
      />
    </section>
  );
}
