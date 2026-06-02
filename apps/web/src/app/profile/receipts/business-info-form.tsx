'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { primaryButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { updateBusinessInfo, type BusinessInfoState } from './business-info-actions';

const initialState: BusinessInfoState = { error: null, success: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}

type Props = {
  businessName: string | null;
  businessAddress: string | null;
  taxId: string | null;
};

export function BusinessInfoForm({ businessName, businessAddress, taxId }: Props) {
  const [state, formAction] = useFormState(updateBusinessInfo, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && <Alert variant="success">Saved.</Alert>}

      <label className="block text-sm">
        <span className="font-medium">Business name</span>
        <input
          name="business_name"
          type="text"
          defaultValue={businessName ?? ''}
          maxLength={120}
          placeholder="e.g. Acme Volleyball Club LLC"
          className="border-border-base bg-surface mt-1 w-full rounded-md border px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Business address</span>
        <textarea
          name="business_address"
          rows={3}
          defaultValue={businessAddress ?? ''}
          maxLength={400}
          placeholder="Street, City, State ZIP"
          className="border-border-base bg-surface mt-1 w-full rounded-md border px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Tax ID (EIN)</span>
        <input
          name="tax_id"
          type="text"
          defaultValue={taxId ?? ''}
          maxLength={40}
          placeholder="XX-XXXXXXX"
          className="border-border-base bg-surface mt-1 w-full rounded-md border px-3 py-2 font-mono"
        />
        <span className="text-muted mt-1 block text-xs">
          Use an EIN if you have one. Do not enter a Social Security Number — this field is not
          encrypted beyond the database default.
        </span>
      </label>

      <SubmitButton />
    </form>
  );
}
