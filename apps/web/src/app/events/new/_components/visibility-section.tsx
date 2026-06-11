'use client';

/**
 * Section 5 of the create-event form (architecture audit P3-1): visibility +
 * rules + the collapsed advanced-details panel. External-registration lives in
 * section 1 now, so the panel is told to skip it (`hideExternal`).
 */
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
  const closeHours = num(values.registrationCloseOffsetHours);
  return {
    venueName: values.venueName ?? null,
    // Restore a relative registration-close window from a template/redisplay.
    // The absolute date is one-off (omitted from templates) so it isn't mapped.
    registrationCloseOffsetMinutes:
      values.registrationCloseMode === 'relative' && closeHours != null
        ? Math.round(closeHours * 60)
        : null,
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
  isExternal,
}: {
  fieldErrors: Record<string, string> | undefined;
  values: Record<string, string> | undefined;
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
        </label>
        <select
          id="visibility"
          name="visibility"
          defaultValue={val(values, 'visibility', 'public')}
          className={inputClass}
          {...fieldA11y('visibility', fieldErrors)}
        >
          <option value="public">Public — anyone can find it</option>
          <option value="invite_only">Invite only (unlisted — share by link)</option>
          <option value="friends_of_host">People the host follows</option>
          <option value="friends_of_attendees">People attendees follow</option>
        </select>
        <FieldError name="visibility" errors={fieldErrors} />
        <p className="text-muted mt-1 text-xs">
          Public events show up in search and the home feed. Unlisted events are reachable only by
          link; friends-only events stay within your network.
        </p>
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
