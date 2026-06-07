'use client';

import { validateTeamCountForFormat, type BracketFormat } from '@pickupvb/domain';
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

  // Seeding is "settled" — and so the form can collapse to signal there's
  // nothing left to do here — only when seeds exist AND match the current
  // registration exactly (no team waiting to be appended, none stale). A
  // newly-added or dropped team means the host still needs to re-save, so the
  // form stays open in that case (the amber banner above tells them why).
  const seedingSaved = props.seeds.length > 0 && newlyAdded.length === 0 && droppedSeedCount === 0;

  // Format-aware readiness: gate Generate on each format's minimum (single 2,
  // round-robin/double-elim 4, …) so the host — or standalone owner, whose
  // create path doesn't enforce a count — sees the issue here instead of a late
  // generator error.
  const genCheck = validateTeamCountForFormat(props.bracketFormat, orderedTeams.length);
  const canGenerate = genCheck.ok;

  return (
    <section className="space-y-4">
      {/* Top action card — the primary thing the host came here to do is
          "Generate bracket". Put it above the fold with the readiness
          summary (team count, format) so they don't scroll past seeding to
          find it. Discard sits next to it as a secondary action. */}
      <div className="border-primary/40 bg-primary/5 rounded-shape-sm flex flex-wrap items-center justify-between gap-3 border p-4">
        <div className="space-y-0.5">
          <p className="text-fg text-sm font-semibold">
            {canGenerate ? 'Ready to generate' : 'Not ready to generate'}
          </p>
          <p className="text-muted text-xs">
            Format:{' '}
            <span className="text-fg/80 font-medium">{FORMAT_LABEL[props.bracketFormat]}</span> ·{' '}
            {orderedTeams.length} team{orderedTeams.length === 1 ? '' : 's'} seeded
          </p>
          {!genCheck.ok && (
            <p className="text-md-error text-xs" role="alert">
              {genCheck.reason}
            </p>
          )}
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

      <SeedingForm scope={scope} orderedTeams={orderedTeams} seedingSaved={seedingSaved} />

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
              + Add teams
            </button>
          )}
          title="Add teams"
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
 *
 * Wrapped in a native `<details>` so that once seeding is settled
 * (`seedingSaved`) the whole editor collapses to a compact "✓ Seeding
 * saved" summary — signalling there's no action left here and putting the
 * host's focus on the Generate card above. `open` is driven off
 * `seedingSaved`: the first save (or a later in-sync re-save) re-renders
 * via revalidation and re-asserts the collapsed state; the host can reopen
 * to edit any time via the summary, and a new/dropped team forces it back
 * open (seedingSaved → false).
 */
function SeedingForm(props: {
  scope: BracketScope;
  orderedTeams: ReadonlyArray<{ entryId: string; name: string }>;
  seedingSaved: boolean;
}) {
  const a = bindBracketActions(props.scope);
  const count = props.orderedTeams.length;
  return (
    <details
      open={!props.seedingSaved}
      className="group/seed border-border-base rounded-shape-sm border"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 select-none">
        {props.seedingSaved ? (
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-md-success text-sm font-semibold">✓ Seeding saved</span>
            <span className="text-muted text-xs">
              {count} team{count === 1 ? '' : 's'} · nothing more to do here
            </span>
          </span>
        ) : (
          <span className="text-fg text-sm font-semibold">Seeding order</span>
        )}
        <span className="text-muted group-hover/seed:text-fg shrink-0 text-xs font-medium">
          <span className="group-open/seed:hidden">Edit</span>
          <span className="hidden group-open/seed:inline">Collapse</span>
        </span>
      </summary>
      <div className="space-y-2 px-4 pb-4">
        <p className="text-muted text-xs">
          Top of the list is seed 1. Drag or use the arrows to reorder, click <em>Randomize</em> to
          shuffle, or save the current order as-is.
        </p>
        <form action={a.seedFromForm} className="space-y-2">
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
      </div>
    </details>
  );
}
