import { LocalDateTime } from '@/components/local-datetime';

type Props = {
  venueName: string | null;
  seriesName: string | null;
  seriesPosition: number | null;
  seriesSize: number | null;
  isFundraiser: boolean;
  fundraiserBeneficiary: string | null;
  themeTags: ReadonlyArray<string>;
  sanctioningBody: string | null;
  registrationClosesAt: Date | null;
  paymentInstructions: string | null;
  /** True when the event uses external registration; we then suppress the
   *  payment-instructions block since {@link ExternalRegistrationCard}
   *  renders the same content. */
  isExternal: boolean;
  timeZone: string | null;
};

/**
 * Renders ADR-0006 event-level extension fields above the fold: series
 * breadcrumb, fundraiser line, sanctioning body, theme tags, and the
 * registration deadline. All fields are optional — the section renders
 * nothing when nothing has been set.
 */
export function EventMetaSection({
  seriesName,
  seriesPosition,
  seriesSize,
  isFundraiser,
  fundraiserBeneficiary,
  themeTags,
  sanctioningBody,
  registrationClosesAt,
  paymentInstructions,
  isExternal,
  timeZone,
}: Props) {
  const seriesLabel = seriesName
    ? seriesSize && seriesPosition
      ? `${seriesName} · Event ${seriesPosition} of ${seriesSize}`
      : seriesName
    : null;
  const hasAnything =
    seriesLabel ||
    isFundraiser ||
    themeTags.length > 0 ||
    sanctioningBody ||
    registrationClosesAt ||
    (paymentInstructions && !isExternal);
  if (!hasAnything) return null;
  return (
    <section className="border-border-base bg-fg/[0.02] space-y-2 rounded-lg border p-4">
      {seriesLabel && (
        <p className="text-fg text-sm">
          <span className="text-muted">Series · </span>
          <span className="font-medium">{seriesLabel}</span>
        </p>
      )}
      {(isFundraiser || sanctioningBody) && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {isFundraiser && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
              Fundraiser{fundraiserBeneficiary ? ` · ${fundraiserBeneficiary}` : ''}
            </span>
          )}
          {sanctioningBody && (
            <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-0.5">
              Sanctioned by {sanctioningBody}
            </span>
          )}
        </div>
      )}
      {themeTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {themeTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-fuchsia-100 px-2 py-0.5 font-medium text-fuchsia-900"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
      {registrationClosesAt && (
        <p className="text-muted text-xs">
          Registration closes{' '}
          <LocalDateTime iso={registrationClosesAt} variant="eventDateLong" timeZone={timeZone} />
        </p>
      )}
      {paymentInstructions && !isExternal && (
        <p className="text-fg/90 text-xs whitespace-pre-wrap">
          <span className="text-muted">Payment notes: </span>
          {paymentInstructions}
        </p>
      )}
    </section>
  );
}
