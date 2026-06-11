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
  /** When true, the hero already surfaces a registration-close countdown,
   *  so we omit the row here to avoid duplication. */
  hideRegistrationCloses?: boolean;
};

/**
 * Renders ADR-0006 event-level extension fields above the fold as a dense
 * definition list. Renders nothing when no fields are set.
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
  hideRegistrationCloses = false,
}: Props) {
  const seriesLabel = seriesName
    ? seriesSize && seriesPosition
      ? `${seriesName} · Event ${seriesPosition} of ${seriesSize}`
      : seriesName
    : null;
  const showRegistrationCloses = registrationClosesAt && !hideRegistrationCloses;
  const showPaymentNotes = paymentInstructions && !isExternal;
  const hasAnything =
    seriesLabel ||
    isFundraiser ||
    themeTags.length > 0 ||
    sanctioningBody ||
    showRegistrationCloses ||
    showPaymentNotes;
  if (!hasAnything) return null;
  return (
    <section
      aria-label="Event details"
      className="border-border-base bg-fg/[0.02] rounded-shape-sm border p-4"
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        {seriesLabel && (
          <Row term="Series">
            <span className="font-medium">{seriesLabel}</span>
          </Row>
        )}
        {isFundraiser && (
          <Row term="Fundraiser">
            <span className="bg-md-warning/15 text-md-warning rounded-full px-2 py-0.5 text-xs font-medium">
              {fundraiserBeneficiary ?? 'Charity event'}
            </span>
          </Row>
        )}
        {sanctioningBody && <Row term="Sanctioned by">{sanctioningBody}</Row>}
        {themeTags.length > 0 && (
          <Row term="Theme">
            <span className="flex flex-wrap gap-1.5">
              {themeTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-medium text-fuchsia-700 dark:text-fuchsia-300"
                >
                  #{tag}
                </span>
              ))}
            </span>
          </Row>
        )}
        {showRegistrationCloses && (
          <Row term="Registration closes">
            <LocalDateTime
              iso={registrationClosesAt!}
              variant="eventDateLong"
              timeZone={timeZone}
            />
          </Row>
        )}
        {showPaymentNotes && (
          <Row term="Payment notes">
            <span className="whitespace-pre-wrap">{paymentInstructions}</span>
          </Row>
        )}
      </dl>
    </section>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted text-xs font-semibold tracking-wide uppercase sm:pt-0.5">{term}</dt>
      <dd className="text-fg/90">{children}</dd>
    </>
  );
}
