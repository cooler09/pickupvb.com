'use client';

import { bindBracketActions } from './bracket-action-binding';
import type { BracketScope, TeamLite } from './labels';
import { FormModal, ModalActions } from '@/components/form-modal';
import { SubmitButton } from '@/components/submit-button';
import { neutralButtonClass, primaryButtonClass } from '@/components/primary-button';

/**
 * Host-only strip on the live board (ADR 0032 / Phase 5). While `active`:
 * substitute a dropped team. Once `completed`: re-open to fix a result. Per-match
 * matchup / court / length edits live on each card via the "Edit" affordance.
 *
 * This is its own `'use client'` module because {@link SubstituteTeamButton}
 * passes render-prop functions to `FormModal`, and RSC can't serialize a
 * function across the server→client boundary. `BoardView` renders us from both a
 * client boundary (the event bracket workspace) *and* a server one (the
 * standalone owner page at `/brackets/[id]`); keeping these here means the latter
 * doesn't throw `Functions cannot be passed directly to Client Components`. See
 * the FormModal pitfall in AGENTS.md.
 */
export function LiveHostTools(props: {
  scope: BracketScope;
  status: 'active' | 'completed';
  teams: ReadonlyArray<TeamLite>;
}) {
  const a = bindBracketActions(props.scope);
  if (props.status === 'completed') {
    return <ReopenStrip reopen={a.reopen} />;
  }
  return (
    <div className="border-border-base bg-fg/5 rounded-shape-sm flex flex-wrap items-center gap-3 border p-3">
      <span className="text-muted text-xs font-semibold tracking-wide uppercase">Host edits</span>
      <SubstituteTeamButton scope={props.scope} teams={props.teams} />
      <span className="text-muted text-xs">
        Use <span className="text-fg/70">Edit</span> on any match to fix a matchup, court, or match
        length.
      </span>
    </div>
  );
}

/**
 * Completed-bracket "Re-open to edit" strip — shared by the event host tools
 * and the standalone owner board (TT-10). `reopen` is a scope-bound server
 * action (event → reopenBracket, standalone → reopenStandaloneBracket).
 */
function ReopenStrip(props: { reopen: () => void | Promise<void> }) {
  return (
    <div className="border-border-base bg-fg/5 rounded-shape-sm flex flex-wrap items-center gap-3 border p-3">
      <span className="text-muted text-xs font-semibold tracking-wide uppercase">Host edits</span>
      <form action={props.reopen} className="flex items-center gap-2">
        <SubmitButton className={neutralButtonClass('sm')}>Re-open to edit</SubmitButton>
        <span className="text-muted text-xs">
          Re-open this completed bracket to fix a result or matchup.
        </span>
      </form>
    </div>
  );
}

function SubstituteTeamButton(props: { scope: BracketScope; teams: ReadonlyArray<TeamLite> }) {
  const action = bindBracketActions(props.scope).replaceEntryFromForm;
  return (
    <FormModal
      trigger={(open) => (
        <button type="button" onClick={open} className={neutralButtonClass('sm')}>
          Substitute a team
        </button>
      )}
      title="Substitute a team"
      description="Swap a team out for another registered team everywhere it appears — for a drop or no-show. Any recorded results carry over to the substitute."
    >
      {(close) => (
        <form action={action} className="space-y-3">
          <TeamPicker name="old_entry_id" label="Replace" teams={props.teams} />
          <TeamPicker name="new_entry_id" label="With" teams={props.teams} />
          <ModalActions
            dismissive={
              <button type="button" onClick={close} className={neutralButtonClass('sm')}>
                Cancel
              </button>
            }
            confirming={
              <SubmitButton className={primaryButtonClass('sm')}>Substitute</SubmitButton>
            }
          />
        </form>
      )}
    </FormModal>
  );
}

function TeamPicker(props: { name: string; label: string; teams: ReadonlyArray<TeamLite> }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-fg/80">{props.label}</span>
      <select
        name={props.name}
        defaultValue=""
        required
        className="border-border-base bg-bg rounded border px-2 py-1"
      >
        <option value="" disabled>
          Choose a team…
        </option>
        {props.teams.map((t) => (
          <option key={t.entryId} value={t.entryId}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
