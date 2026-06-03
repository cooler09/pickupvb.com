'use client';

import type { BracketFormat } from '@pickupvb/domain';
import { primaryButtonClass } from '@/components/primary-button';
import { FormModal } from '@/components/form-modal';
import { SubmitButton } from '@/components/submit-button';
import { bindBracketActions, eventScope } from './bracket-action-binding';
import { FORMAT_LABEL, type BracketScope, type TeamLite } from './labels';
import { SeedingList } from './seeding-list';
import { WalkInTeamForm } from './walk-in-team-form';

export function SetupView(props: {
  eventId?: string;
  divisionId?: string;
  /** Standalone scope; defaults to the event scope from eventId/divisionId. */
  scope?: BracketScope;
  bracketFormat: BracketFormat;
  seeds: ReadonlyArray<{ entryId: string; seed: number }>;
  registeredTeams: ReadonlyArray<TeamLite>;
  isHost: boolean;
}) {
  const scope = props.scope ?? eventScope(props.eventId!, props.divisionId!);
  const a = bindBracketActions(scope);
  const standalone = scope.kind === 'standalone';
  if (!props.isHost) {
    return (
      <p className="text-muted text-sm">
        The host is still setting up the bracket. Check back shortly.
      </p>
    );
  }

  // Reconcile current seeds with the latest registration list:
  //  - Drop seeds for teams that have unregistered.
  //  - Append newly-registered teams to the end so the host can re-save
  //    seeding to include them.
  let orderedTeams: TeamLite[];
  let newlyAdded: TeamLite[] = [];
  if (props.seeds.length === 0) {
    orderedTeams = [...props.registeredTeams];
  } else {
    const seededInOrder = props.seeds
      .slice()
      .sort((a, b) => a.seed - b.seed)
      .map((s) => props.registeredTeams.find((t) => t.entryId === s.entryId))
      .filter((t): t is TeamLite => !!t);
    const seededIds = new Set(seededInOrder.map((t) => t.entryId));
    newlyAdded = props.registeredTeams.filter((t) => !seededIds.has(t.entryId));
    orderedTeams = [...seededInOrder, ...newlyAdded];
  }

  const droppedSeedCount =
    props.seeds.length -
    props.seeds.filter((s) => props.registeredTeams.some((t) => t.entryId === s.entryId)).length;

  const canGenerate = orderedTeams.length >= 2;

  return (
    <section className="space-y-4">
      {/* Top action card — the primary thing the host came here to do is
          "Generate bracket". Put it above the fold with the readiness
          summary (team count, format) so they don't scroll past seeding to
          find it. Discard sits next to it as a secondary action. */}
      <div className="border-primary/40 bg-primary/5 rounded-shape-sm flex flex-wrap items-center justify-between gap-3 border p-4">
        <div className="space-y-0.5">
          <p className="text-fg text-sm font-semibold">
            {canGenerate ? 'Ready to generate' : 'Add a team to continue'}
          </p>
          <p className="text-muted text-xs">
            Format:{' '}
            <span className="text-fg/80 font-medium">{FORMAT_LABEL[props.bracketFormat]}</span> ·{' '}
            {orderedTeams.length} team{orderedTeams.length === 1 ? '' : 's'} seeded
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={a.generate}>
            <SubmitButton disabled={!canGenerate} className={primaryButtonClass('md')}>
              Generate bracket
            </SubmitButton>
          </form>
          <form action={a.reset}>
            <SubmitButton className="border-border-base text-fg/80 hover:bg-fg/5 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
              Discard
            </SubmitButton>
          </form>
        </div>
      </div>

      {(newlyAdded.length > 0 || droppedSeedCount > 0) && (
        <div className="rounded-shape-sm border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          {newlyAdded.length > 0 && (
            <p>
              {newlyAdded.length} newly registered team
              {newlyAdded.length === 1 ? '' : 's'} {newlyAdded.length === 1 ? 'has' : 'have'} been
              appended to the seeding list. Reorder if needed and click <em>Save seeding</em> to
              include {newlyAdded.length === 1 ? 'it' : 'them'}.
            </p>
          )}
          {droppedSeedCount > 0 && (
            <p className={newlyAdded.length > 0 ? 'mt-1' : undefined}>
              {droppedSeedCount} previously seeded team
              {droppedSeedCount === 1 ? '' : 's'} {droppedSeedCount === 1 ? 'is' : 'are'} no longer
              registered and {droppedSeedCount === 1 ? 'was' : 'were'} removed from the list.
            </p>
          )}
        </div>
      )}

      <SeedingForm scope={scope} orderedTeams={orderedTeams} />

      {/* Walk-in form is secondary at this stage — the host already has a
          bracket in setup. Lives behind a modal so registering teams
          doesn't push the seeding list around; the modal stays open across
          adds (see WalkInTeamForm) for entering several at once. When the
          host can't generate yet, the trigger is promoted to primary. */}
      <div className="flex justify-start">
        <FormModal
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className={
                canGenerate
                  ? 'border-border-base text-fg/80 hover:bg-fg/5 rounded-md border border-dashed px-3 py-1.5 text-sm font-medium'
                  : primaryButtonClass('sm')
              }
            >
              {standalone ? '+ Add teams' : '+ Add walk-in teams'}
            </button>
          )}
          title={standalone ? 'Add teams' : 'Add walk-in teams'}
          description={
            standalone
              ? 'Type in the team names competing in this bracket — one at a time, or switch to “Paste a list” to add a whole roster at once. The modal stays open so you can keep adding.'
              : "For teams not registered to this division. Add as many as you need — the modal stays open after each. You can edit rosters later from the event's team management page."
          }
        >
          {(close) => (
            <WalkInTeamForm
              scope={scope}
              onClose={close}
              {...(standalone ? { showRoster: false } : {})}
            />
          )}
        </FormModal>
      </div>
    </section>
  );
}

/**
 * Seeding form. Submits hidden `entry_id` inputs in the order shown.
 * The values are `event_team_entries.id`s that the seed-write path
 * stamps into `bracket_seeds.entry_id`. The "Randomize" button uses
 * `formAction` to override the submit handler with a server action
 * that re-seeds and revalidates.
 */
function SeedingForm(props: {
  scope: BracketScope;
  orderedTeams: ReadonlyArray<{ entryId: string; name: string }>;
}) {
  const a = bindBracketActions(props.scope);
  return (
    <form
      action={a.seedFromForm}
      className="border-border-base rounded-shape-sm space-y-2 border p-4"
    >
      <h3 className="text-fg text-sm font-semibold">Seeding order</h3>
      <p className="text-muted text-xs">
        Top of the list is seed 1. Drag or use the arrows to reorder, click <em>Randomize</em> to
        shuffle, or save the current order as-is.
      </p>
      <SeedingList
        key={props.orderedTeams.map((t) => t.entryId).join(',')}
        orderedTeams={props.orderedTeams}
      />
      <div className="flex flex-wrap gap-2 pt-2">
        <SubmitButton className={primaryButtonClass('md')}>Save seeding</SubmitButton>
        <SubmitButton
          name="randomize"
          value="1"
          className="border-border-base text-fg/80 hover:bg-fg/5 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          formAction={a.randomizeSeedFromForm}
        >
          Randomize
        </SubmitButton>
      </div>
    </form>
  );
}
