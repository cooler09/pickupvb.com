import { fieldErrorClass, fieldInputClass, fieldLabelClass } from '@/components/field-styles';

/**
 * Shared name + email fields for the guest-RSVP / guest-checkout flows.
 *
 * Before this (persona-ux.md P-1) the same "sign up as a guest" intent was
 * built two different ways depending on the event's price model — the
 * free-event form (`guest-signup-form.tsx`) and the paid-event checkout form
 * (`paid-ticket-panel.tsx`) hand-rolled separate inputs with different label
 * sizes, focus treatments, and background tokens. This collapses both onto the
 * shared `field-styles.ts` recipe (CC-2) so the action reads identically.
 *
 * No `'use client'` — it renders only bare inputs + class strings, so it works
 * inside the client `GuestSignupForm` and the server `PaidTicketPanel` alike.
 * Both flows post the same `display_name` / `email` field names, so the
 * server actions are unchanged.
 */
type Props = {
  /**
   * When true, email is required (paid checkout needs a receipt + cancellation
   * address). Free RSVP leaves it optional — it only lets the guest claim the
   * signup later.
   */
  emailRequired?: boolean;
  /** Per-field validation errors keyed by field name (the free panel's `useFormState`). */
  errors?: Record<string, string> | undefined;
};

export function GuestSignupFields({ emailRequired = false, errors }: Props) {
  return (
    <>
      <div>
        <label htmlFor="display_name" className={fieldLabelClass}>
          Name
        </label>
        <input
          id="display_name"
          name="display_name"
          required
          maxLength={80}
          autoComplete="name"
          className={fieldInputClass}
        />
        {errors?.display_name && <p className={fieldErrorClass}>{errors.display_name}</p>}
      </div>
      <div>
        <label htmlFor="email" className={fieldLabelClass}>
          Email{' '}
          {!emailRequired && (
            <span className="text-fg/50">(optional — lets you claim this signup later)</span>
          )}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required={emailRequired}
          maxLength={120}
          autoComplete="email"
          className={fieldInputClass}
        />
        {errors?.email && <p className={fieldErrorClass}>{errors.email}</p>}
      </div>
    </>
  );
}
