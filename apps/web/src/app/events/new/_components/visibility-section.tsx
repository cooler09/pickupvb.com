'use client';

/**
 * Section 5 of the create-event form (architecture audit P3-1): visibility +
 * rules + the collapsed advanced-details panel. External-registration lives in
 * section 1 now, so the panel is told to skip it (`hideExternal`).
 */
import Link from 'next/link';
import AdvancedDetailsPanel, {
  type AdvancedDetailsInitial,
} from '@/components/event-advanced-details-panel';
import { FieldError, fieldA11y } from '@/components/field-error';
import {
  cardClass,
  cardSubClass,
  cardTitleClass,
  inputClass,
  labelClass,
  val,
} from './form-primitives';

/**
 * Map a previously-submitted / template `values` map onto the panel's typed
 * `initial` so an applied template round-trips its advanced fields (venue,
 * series, fundraiser, theme tags, sanctioning) when the form remounts (CE-1
 * follow-up). One-off dates (`registrationClosesAt`, like `startsAt`/`endsAt`)
 * are intentionally excluded from saved templates upstream, so they stay blank
 * here. External-registration round-trips via the parent's `isExternal` state +
 * `ExternalFields`, not this panel (`hideExternal`).
 */
function advancedInitialFromValues(
  values: Record<string, string> | undefined,
): AdvancedDetailsInitial | undefined {
  if (!values) return undefined;
  const num = (raw: string | undefined): number | null => {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const themeTagsRaw = values.themeTags;
  return {
    venueName: values.venueName ?? null,
    seriesName: values.seriesName ?? null,
    seriesPosition: num(values.seriesPosition),
    seriesSize: num(values.seriesSize),
    isFundraiser: values.isFundraiser === 'on',
    fundraiserBeneficiary: values.fundraiserBeneficiary ?? null,
    themeTags: themeTagsRaw
      ? themeTagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : null,
    sanctioningBody: values.sanctioningBody ?? null,
  };
}

export default function VisibilitySection({
  fieldErrors,
  values,
  viewerHasProBenefits,
  isExternal,
}: {
  fieldErrors: Record<string, string> | undefined;
  values: Record<string, string> | undefined;
  viewerHasProBenefits: boolean;
  isExternal: boolean;
}) {
  const advancedInitial = advancedInitialFromValues(values);
  return (
    <section className={cardClass}>
      <div>
        <h2 className={cardTitleClass}>Visibility &amp; advanced details</h2>
        <p className={cardSubClass}>
          Most hosts can leave these as-is. Open if you need to restrict who sees the event, mark it
          as a series, fundraiser, or sanctioned event.
        </p>
      </div>
      <div>
        <label htmlFor="visibility" className={labelClass}>
          Who can see this event?
          {!viewerHasProBenefits && <span className="text-muted ml-1 text-xs">(Pro)</span>}
        </label>
        <select
          id="visibility"
          name="visibility"
          defaultValue={viewerHasProBenefits ? val(values, 'visibility', 'public') : 'public'}
          disabled={!viewerHasProBenefits}
          className={inputClass}
          {...fieldA11y('visibility', fieldErrors)}
        >
          <option value="public">Public — anyone can find it</option>
          <option value="invite_only">Invite only (unlisted — share by link)</option>
          <option value="friends_of_host">People the host follows</option>
          <option value="friends_of_attendees">People attendees follow</option>
        </select>
        <FieldError name="visibility" errors={fieldErrors} />
        {!viewerHasProBenefits && (
          <p className="text-muted mt-1 text-xs">
            Free events are public.{' '}
            <Link href="/pricing" className="text-primary hover:underline">
              Upgrade to Pro
            </Link>{' '}
            to host unlisted or friends-only events.
          </p>
        )}
      </div>
      <div>
        <label htmlFor="rules" className={labelClass}>
          Rules <span className="text-fg/50">(optional)</span>
        </label>
        <textarea
          id="rules"
          name="rules"
          rows={2}
          maxLength={4000}
          defaultValue={val(values, 'rules')}
          placeholder="Rally scoring to 25, win by 2. Captain's choice on lets."
          className={inputClass}
          {...fieldA11y('rules', fieldErrors)}
        />
        <FieldError name="rules" errors={fieldErrors} />
      </div>
      <AdvancedDetailsPanel
        hideExternal
        isExternal={isExternal}
        {...(advancedInitial ? { initial: advancedInitial } : {})}
      />
    </section>
  );
}
