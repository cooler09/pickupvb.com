'use client';

import { BracketViewSkeleton } from './bracket-view-skeleton';
import { FormatPickerForm } from './format-picker-form';
import type { TeamLite } from './labels';

export function NoBracketView(props: {
  eventId: string;
  divisionId: string;
  registeredTeams: ReadonlyArray<TeamLite>;
  isHost: boolean;
  /** False while `useEventManageCaps` is still resolving — hold the spectator
   *  copy until then so a host doesn't flash it before the create form (UX-1). */
  capsResolved: boolean;
}) {
  if (!props.isHost) {
    if (!props.capsResolved) return <BracketViewSkeleton />;
    return (
      <p className="text-muted text-sm">
        The host hasn{'’'}t created a bracket for this tournament yet.
      </p>
    );
  }
  return (
    <section className="border-border-base bg-fg/5 rounded-shape-sm space-y-4 border p-4">
      <div className="space-y-1">
        <h2 className="text-fg text-lg font-semibold">Create bracket</h2>
        <p className="text-muted text-sm">
          Walk through the steps — confirm teams, pick a format, set match length — then generate.
          To switch formats later, delete the bracket from its setup screen and start over.
        </p>
      </div>
      {/* The stepper opens on a "Teams" step where the host confirms the
          registered list and adds any walk-in / off-site teams, so the
          previous standalone "Add teams" modal lives inside the form now. */}
      <FormatPickerForm
        eventId={props.eventId}
        divisionId={props.divisionId}
        teamCount={props.registeredTeams.length}
        registeredTeams={props.registeredTeams}
      />
    </section>
  );
}
