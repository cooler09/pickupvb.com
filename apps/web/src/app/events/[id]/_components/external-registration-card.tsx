type Props = {
  externalRegistrationUrl: string | null;
  externalRegistrationInstructions: string | null;
  paymentInstructions: string | null;
};

/**
 * Per ADR 0006, when an event's `registrationMode === 'external'` the
 * on-platform RSVP / team / free-agent / checkout panels are hidden and
 * replaced with a single "How to register" card. URL is rendered as an
 * external link with `rel="noreferrer"` for safety.
 */
export function ExternalRegistrationCard({
  externalRegistrationUrl,
  externalRegistrationInstructions,
  paymentInstructions,
}: Props) {
  return (
    <section className="border-primary/40 bg-primary/5 space-y-3 rounded-lg border p-4">
      <h2 className="text-fg text-lg font-semibold">How to register</h2>
      <p className="text-muted text-sm">Signup for this event is handled off PickupVB.</p>
      {externalRegistrationUrl && (
        <a
          href={externalRegistrationUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-primary text-primary-fg inline-block rounded px-3 py-1.5 text-sm font-medium"
        >
          Register on the host&apos;s site <span aria-hidden="true">↗</span>
          <span className="sr-only"> (opens in new tab)</span>
        </a>
      )}
      {externalRegistrationInstructions && (
        <div className="space-y-1">
          <h3 className="text-fg text-sm font-semibold">Instructions</h3>
          <p className="text-fg/90 text-sm whitespace-pre-wrap">
            {externalRegistrationInstructions}
          </p>
        </div>
      )}
      {paymentInstructions && (
        <div className="space-y-1">
          <h3 className="text-fg text-sm font-semibold">Payment</h3>
          <p className="text-fg/90 text-sm whitespace-pre-wrap">{paymentInstructions}</p>
        </div>
      )}
    </section>
  );
}
