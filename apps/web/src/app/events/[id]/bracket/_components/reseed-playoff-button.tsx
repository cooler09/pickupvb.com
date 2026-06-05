'use client';

import { FormModal, ModalActions } from '@/components/form-modal';
import { SubmitButton } from '@/components/submit-button';
import { neutralButtonClass, primaryButtonClass } from '@/components/primary-button';
import { bindBracketActions } from './bracket-action-binding';
import { SeedingList } from './seeding-list';
import type { BracketScope } from './labels';

/**
 * Host override of the auto cross-seed (ADR 0032 / `Bracket.seedPlayoff`):
 * drag the advancing teams into the overall seed order you want (#1 at the top),
 * then re-seed. Only offered before any playoff match starts (the domain rejects
 * a re-seed once results are in). Pre-filled with the current cross-seed order so
 * leaving it untouched is a no-op. Works for event + standalone scope (TT-11).
 */
export function ReseedPlayoffButton(props: {
  scope: BracketScope;
  orderedTeams: ReadonlyArray<{ entryId: string; name: string }>;
}) {
  const action = bindBracketActions(props.scope).seedPlayoffFromForm;
  return (
    <FormModal
      trigger={(open) => (
        <button type="button" onClick={open} className={neutralButtonClass('sm')}>
          Re-seed playoff
        </button>
      )}
      title="Re-seed the playoff"
      description="Override the auto cross-seed: drag the advancing teams into the overall seed order you want (#1 at the top). Only available before any playoff match starts."
      size="lg"
    >
      {(close) => (
        <form action={action} className="space-y-3">
          <SeedingList orderedTeams={props.orderedTeams} />
          <ModalActions
            dismissive={
              <button type="button" onClick={close} className={neutralButtonClass('sm')}>
                Cancel
              </button>
            }
            confirming={<SubmitButton className={primaryButtonClass('sm')}>Re-seed</SubmitButton>}
          />
        </form>
      )}
    </FormModal>
  );
}
