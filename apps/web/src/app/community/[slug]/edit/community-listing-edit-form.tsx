'use client';

import type { Route } from 'next';
import { useFormState } from 'react-dom';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';
import {
  CommunityListingFields,
  CommunityListingFormFooter,
  type CommunityListingFieldValues,
} from '@/app/community/_components/community-listing-fields';
import type { CommunityListingFormState } from '@/app/community/_lib/parse-community-listing-form';
import { editCommunityListingAction } from './actions';

export type EditFormInitialValues = CommunityListingFieldValues & {
  id: string;
  slug: string;
  startsAt: Date;
};

const initialState: CommunityListingFormState = {};

export default function EditCommunityListingForm({ initial }: { initial: EditFormInitialValues }) {
  const boundAction = editCommunityListingAction.bind(null, initial.id, initial.slug);
  const [state, formAction] = useFormState(boundAction, initialState);
  const errorRef = useAlertReveal(state, Boolean(state.error));

  return (
    <form action={formAction} className="space-y-6 pb-24 sm:pb-0">
      {state.error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant="error">{state.error}</Alert>
        </div>
      )}
      <CommunityListingFields fieldErrors={state.fieldErrors} initial={initial} />
      <CommunityListingFormFooter
        cancelHref={`/community/${initial.slug}` as Route}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />
    </form>
  );
}
