import type { BracketFormat } from '@pickupvb/domain';
import { SubmitButton } from '@/components/submit-button';
import {
  generateBracket,
  randomizeSeedFromForm,
  resetBracket,
  seedBracketFromForm,
} from '../actions';
import { FORMAT_LABEL, type TeamLite } from './labels';

export function SetupView(props: {
  eventId: string;
  divisionId: string;
  bracketFormat: BracketFormat;
  seeds: ReadonlyArray<{ teamId: string; seed: number }>;
  registeredTeams: ReadonlyArray<TeamLite>;
  isHost: boolean;
}) {
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
      .map((s) => props.registeredTeams.find((t) => t.teamId === s.teamId))
      .filter((t): t is TeamLite => !!t);
    const seededIds = new Set(seededInOrder.map((t) => t.teamId));
    newlyAdded = props.registeredTeams.filter((t) => !seededIds.has(t.teamId));
    orderedTeams = [...seededInOrder, ...newlyAdded];
  }

  const droppedSeedCount =
    props.seeds.length -
    props.seeds.filter((s) => props.registeredTeams.some((t) => t.teamId === s.teamId)).length;

  const canGenerate = orderedTeams.length >= 2;

  return (
    <section className="space-y-4">
      <div className="border-border-base bg-fg/5 rounded-lg border p-4">
        <p className="text-muted text-sm">
          Format: <span className="text-fg font-medium">{FORMAT_LABEL[props.bracketFormat]}</span>
        </p>
      </div>

      {(newlyAdded.length > 0 || droppedSeedCount > 0) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
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

      <SeedingForm
        eventId={props.eventId}
        divisionId={props.divisionId}
        orderedTeams={orderedTeams}
      />

      <div className="flex flex-wrap gap-2">
        <form action={generateBracket.bind(null, props.eventId, props.divisionId)}>
          <SubmitButton
            disabled={!canGenerate}
            className="bg-primary text-primary-fg rounded px-3 py-1 text-sm disabled:opacity-50"
          >
            Generate bracket
          </SubmitButton>
        </form>
        <form action={resetBracket.bind(null, props.eventId, props.divisionId)}>
          <SubmitButton className="border-border-base text-fg/80 hover:bg-fg/5 rounded border px-3 py-1 text-sm disabled:opacity-50">
            Discard bracket
          </SubmitButton>
        </form>
      </div>
    </section>
  );
}

/**
 * Seeding form. Submits hidden `team_id` inputs in the order shown. The
 * "Randomize" button uses `formAction` to override the submit handler with
 * a server action that re-seeds and revalidates.
 */
function SeedingForm(props: {
  eventId: string;
  divisionId: string;
  orderedTeams: ReadonlyArray<{ teamId: string; name: string }>;
}) {
  return (
    <form
      action={seedBracketFromForm.bind(null, props.eventId, props.divisionId)}
      className="border-border-base space-y-2 rounded-lg border p-4"
    >
      <h3 className="text-fg text-sm font-semibold">Seeding order</h3>
      <p className="text-muted text-xs">
        Top of the list is seed 1. Click <em>Randomize</em> to shuffle, or save the current order
        as-is.
      </p>
      <SeedingList orderedTeams={props.orderedTeams} />
      <div className="flex flex-wrap gap-2 pt-2">
        <SubmitButton className="bg-primary text-primary-fg rounded px-3 py-1 text-sm disabled:opacity-50">
          Save seeding
        </SubmitButton>
        <SubmitButton
          name="randomize"
          value="1"
          className="border-border-base text-fg/80 hover:bg-fg/5 rounded border px-3 py-1 text-sm disabled:opacity-50"
          formAction={randomizeSeedFromForm.bind(null, props.eventId, props.divisionId)}
        >
          Randomize
        </SubmitButton>
      </div>
    </form>
  );
}

function SeedingList(props: { orderedTeams: ReadonlyArray<{ teamId: string; name: string }> }) {
  return (
    <ol className="space-y-1">
      {props.orderedTeams.map((t, i) => (
        <li
          key={t.teamId}
          className="border-border-base/60 bg-bg flex items-center gap-2 rounded border px-2 py-1 text-sm"
        >
          <span className="text-muted w-6 text-right tabular-nums">{i + 1}.</span>
          <span className="text-fg flex-1 truncate">{t.name}</span>
          <input type="hidden" name="team_id" value={t.teamId} />
        </li>
      ))}
    </ol>
  );
}
