'use client';

/**
 * Optional event-level fields per ADR 0006:
 *   - Venue name
 *   - Registration close date
 *   - Series (name / position / size)
 *   - Fundraiser toggle + beneficiary
 *   - Theme tags
 *   - External registration toggle (URL / instructions / payment instructions)
 *
 * All fields are optional and collapsed under a single advanced panel so
 * the form stays approachable for the common "just a pickup night" case.
 */

import { useState } from 'react';
import DateTimePicker from '@/components/datetime-picker';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
  fieldSubLabelClass as subLabelClass,
} from '@/components/field-styles';

export type AdvancedDetailsInitial = {
  venueName?: string | null;
  registrationClosesAt?: Date | null;
  registrationCloseOffsetMinutes?: number | null;
  seriesName?: string | null;
  seriesPosition?: number | null;
  seriesSize?: number | null;
  isFundraiser?: boolean;
  fundraiserBeneficiary?: string | null;
  themeTags?: string[] | null;
  sanctioningBody?: string | null;
  registrationMode?: 'platform' | 'external';
  externalRegistrationUrl?: string | null;
  externalRegistrationInstructions?: string | null;
  paymentInstructions?: string | null;
};

export default function AdvancedDetailsPanel({
  onExternalChange,
  initial,
  defaultOpen,
  hideExternal,
  isExternal: externalOverride,
}: {
  onExternalChange?: (external: boolean) => void;
  initial?: AdvancedDetailsInitial;
  defaultOpen?: boolean;
  /**
   * When true, the external-registration toggle and its fields are not
   * rendered. The hosting form may want to promote that toggle into a
   * more prominent section (e.g. above the type chooser) without
   * duplicating the input names.
   */
  hideExternal?: boolean;
  /**
   * When `hideExternal` is true the parent form owns the external-mode
   * toggle. Pass its current value here so this panel can hide
   * sub-fields that don't apply off-platform (e.g. on-platform
   * registration close date).
   */
  isExternal?: boolean;
}) {
  const hasInitialAdvanced = Boolean(
    initial &&
    (initial.venueName ||
      initial.registrationClosesAt ||
      initial.registrationCloseOffsetMinutes != null ||
      initial.seriesName ||
      initial.isFundraiser ||
      (initial.themeTags && initial.themeTags.length > 0) ||
      initial.sanctioningBody ||
      (!hideExternal && initial.registrationMode === 'external')),
  );
  const [open, setOpen] = useState(Boolean(defaultOpen) || hasInitialAdvanced);
  const [isFundraiser, setIsFundraiser] = useState(Boolean(initial?.isFundraiser));
  const [isSeries, setIsSeries] = useState(Boolean(initial?.seriesName));
  const [isExternal, setIsExternal] = useState(initial?.registrationMode === 'external');
  // When the parent owns the external toggle (hideExternal=true) prefer its
  // value so sub-fields gated on "on-platform registration" hide/show in
  // sync with the parent's checkbox.
  const effectiveExternal = externalOverride ?? isExternal;
  const [registrationClosesAt, setRegistrationClosesAt] = useState<Date | null>(
    initial?.registrationClosesAt ?? null,
  );
  // Registration-close window: "start" (open until kickoff), "relative" (N
  // hours before start — auto-follows a start-time edit), or "absolute" (a
  // specific date/time). The server action keys off the chosen mode, so only
  // the active sub-input is rendered/submitted.
  const initialCloseMode: 'start' | 'relative' | 'absolute' = initial?.registrationClosesAt
    ? 'absolute'
    : initial?.registrationCloseOffsetMinutes != null
      ? 'relative'
      : 'start';
  const [registrationCloseMode, setRegistrationCloseMode] = useState(initialCloseMode);
  const [registrationCloseOffsetHours, setRegistrationCloseOffsetHours] = useState(
    initial?.registrationCloseOffsetMinutes != null
      ? Math.max(1, Math.round(initial.registrationCloseOffsetMinutes / 60))
      : 24,
  );

  function toggleExternal(next: boolean) {
    setIsExternal(next);
    onExternalChange?.(next);
  }

  return (
    <fieldset className="border-border-base space-y-3 rounded-md border p-4">
      <legend className="text-fg px-1 text-sm font-semibold">
        Additional details <span className="text-muted font-normal">(optional)</span>
      </legend>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-primary text-sm hover:underline"
      >
        {open
          ? 'Hide advanced options'
          : hideExternal
            ? 'Show advanced options (venue, series, fundraiser, theme tags)'
            : 'Show advanced options (venue, series, fundraiser, external registration)'}
      </button>

      {open && (
        <div className="border-border-base space-y-5 border-t pt-4">
          {/* Venue name */}
          <div>
            <label htmlFor="venueName" className={labelClass}>
              Venue name
            </label>
            <input
              id="venueName"
              name="venueName"
              maxLength={200}
              defaultValue={initial?.venueName ?? ''}
              placeholder="e.g. Lincoln Park Beach #7"
              className={inputClass}
            />
            <p className="text-muted mt-1 text-xs">
              Shown above the address on the event card. Helpful when the street address alone is
              ambiguous (parks, beach courts, community centers).
            </p>
          </div>

          {/* Registration closes — only relevant for on-platform signups;
              off-platform registrars (AES, Eventbrite, …) manage their own
              deadlines, so hide the field entirely when external. The mode
              radio is the source of truth: the server action reads
              `registrationCloseMode` and only the active sub-input submits. */}
          {!effectiveExternal && (
            <div>
              <span className={labelClass}>Registration closes</span>
              <div className="mt-1 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="registrationCloseMode"
                    value="start"
                    checked={registrationCloseMode === 'start'}
                    onChange={() => setRegistrationCloseMode('start')}
                  />
                  When the event starts
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="registrationCloseMode"
                    value="relative"
                    checked={registrationCloseMode === 'relative'}
                    onChange={() => setRegistrationCloseMode('relative')}
                  />
                  <input
                    type="number"
                    name="registrationCloseOffsetHours"
                    min={1}
                    step={1}
                    value={registrationCloseOffsetHours}
                    disabled={registrationCloseMode !== 'relative'}
                    onChange={(e) =>
                      setRegistrationCloseOffsetHours(Math.max(1, Number(e.target.value) || 1))
                    }
                    className={`${inputClass} w-20`}
                  />
                  hours before start
                </label>

                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="registrationCloseMode"
                    value="absolute"
                    className="mt-1"
                    checked={registrationCloseMode === 'absolute'}
                    onChange={() => setRegistrationCloseMode('absolute')}
                  />
                  <span className="flex-1">
                    At a specific date &amp; time
                    {registrationCloseMode === 'absolute' && (
                      <span className="mt-1 block">
                        <DateTimePicker
                          name="registrationClosesAt"
                          value={registrationClosesAt}
                          onChange={setRegistrationClosesAt}
                          minDate={new Date()}
                          inputClass={inputClass}
                        />
                      </span>
                    )}
                  </span>
                </label>
              </div>
              <p className="text-muted mt-1 text-xs">
                Players can sign up until this point. Pick “24 hours before start” to finalize the
                day before, or set an exact cutoff.
              </p>
            </div>
          )}

          {/* Series */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="isSeries"
              checked={isSeries}
              onChange={(e) => setIsSeries(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="text-fg font-medium">Part of a series</span>
              <span className="text-muted block text-xs">
                e.g. weekly winter league, summer tournament series.
              </span>
            </span>
          </label>
          {isSeries && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="seriesName" className={subLabelClass}>
                  Series name
                </label>
                <input
                  id="seriesName"
                  name="seriesName"
                  maxLength={120}
                  defaultValue={initial?.seriesName ?? ''}
                  placeholder="Winter League 2026"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="seriesPosition" className={subLabelClass}>
                    Stop #
                  </label>
                  <input
                    id="seriesPosition"
                    name="seriesPosition"
                    type="number"
                    min={1}
                    defaultValue={initial?.seriesPosition ?? ''}
                    placeholder="3"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="seriesSize" className={subLabelClass}>
                    of
                  </label>
                  <input
                    id="seriesSize"
                    name="seriesSize"
                    type="number"
                    min={1}
                    defaultValue={initial?.seriesSize ?? ''}
                    placeholder="8"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Fundraiser */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="isFundraiser"
              checked={isFundraiser}
              onChange={(e) => setIsFundraiser(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="text-fg font-medium">Fundraiser event</span>
              <span className="text-muted block text-xs">
                Proceeds support a beneficiary (charity, team, scholarship).
              </span>
            </span>
          </label>
          {isFundraiser && (
            <div>
              <label htmlFor="fundraiserBeneficiary" className={subLabelClass}>
                Beneficiary
              </label>
              <input
                id="fundraiserBeneficiary"
                name="fundraiserBeneficiary"
                maxLength={200}
                defaultValue={initial?.fundraiserBeneficiary ?? ''}
                placeholder="e.g. Local Boys & Girls Club"
                className={inputClass}
              />
            </div>
          )}

          {/* Theme tags */}
          <div>
            <label htmlFor="themeTags" className={labelClass}>
              Theme tags
            </label>
            <input
              id="themeTags"
              name="themeTags"
              maxLength={200}
              defaultValue={initial?.themeTags ? initial.themeTags.join(', ') : ''}
              placeholder="halloween, costumes, glow"
              className={inputClass}
            />
            <p className="text-muted mt-1 text-xs">
              Comma-separated. Shown as badges on the event card.
            </p>
          </div>

          {/* Sanctioning */}
          <div>
            <label htmlFor="sanctioningBody" className={labelClass}>
              Sanctioning body
            </label>
            <input
              id="sanctioningBody"
              name="sanctioningBody"
              maxLength={60}
              defaultValue={initial?.sanctioningBody ?? ''}
              placeholder="e.g. NAGVA, AVP, USAV"
              className={inputClass}
            />
          </div>

          {/* External registration */}
          {!hideExternal && (
            <div className="border-border-base bg-highlight/20 rounded-md border p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isExternal"
                  checked={isExternal}
                  onChange={(e) => toggleExternal(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-fg font-medium">Registration happens off-platform</span>
                  <span className="text-muted block text-xs">
                    Use this for tournaments hosted via AES, VolleyballLife, Eventbrite, etc.
                    PickupVB will list the event and link to the external registration page; we
                    won&apos;t collect signups or payments.
                  </span>
                </span>
              </label>
              {isExternal && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label htmlFor="externalRegistrationUrl" className={subLabelClass}>
                      Registration URL
                    </label>
                    <input
                      id="externalRegistrationUrl"
                      name="externalRegistrationUrl"
                      type="url"
                      maxLength={2048}
                      defaultValue={initial?.externalRegistrationUrl ?? ''}
                      placeholder="https://…"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="externalRegistrationInstructions" className={subLabelClass}>
                      Instructions
                    </label>
                    <textarea
                      id="externalRegistrationInstructions"
                      name="externalRegistrationInstructions"
                      rows={2}
                      maxLength={2000}
                      defaultValue={initial?.externalRegistrationInstructions ?? ''}
                      placeholder="e.g. Register via AES by Friday. Bring photo ID to check-in."
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="paymentInstructions" className={subLabelClass}>
                      Payment instructions
                    </label>
                    <textarea
                      id="paymentInstructions"
                      name="paymentInstructions"
                      rows={2}
                      maxLength={2000}
                      defaultValue={initial?.paymentInstructions ?? ''}
                      placeholder="e.g. Venmo @league-org or pay at check-in (cash/card)."
                      className={inputClass}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
