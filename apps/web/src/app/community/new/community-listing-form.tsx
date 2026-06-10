'use client';

import { useFormState } from 'react-dom';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';
import {
  CommunityListingFields,
  CommunityListingFormFooter,
} from '@/app/community/_components/community-listing-fields';
import type { CommunityListingFormState } from '@/app/community/_lib/parse-community-listing-form';
import { createCommunityListingAction } from './actions';

const initialState: CommunityListingFormState = {};

export default function NewCommunityListingForm() {
  const [state, formAction] = useFormState(createCommunityListingAction, initialState);
  const errorRef = useAlertReveal(state, Boolean(state.error));

  return (
    <form action={formAction} className="space-y-6 pb-24 sm:pb-0">
      {state.error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant="error">{state.error}</Alert>
        </div>
      )}
      <CommunityListingFields fieldErrors={state.fieldErrors} floorStartToToday />
      <CommunityListingFormFooter
        cancelHref="/community"
        submitLabel="Submit listing"
        pendingLabel="Submitting…"
      />
    </form>
  );
}
