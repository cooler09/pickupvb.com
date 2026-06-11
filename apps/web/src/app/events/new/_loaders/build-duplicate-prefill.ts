/**
 * "Host again" — turn a past event into a partial prefill for the new-event
 * form. The form already accepts a flat `Record<string,string>` of field-name →
 * value (the same `templateValues` mechanism saved templates use), merged over
 * the defaults, so a *partial* record is enough: every key we omit falls back to
 * the form's default.
 *
 * Pure + unit-tested ([build-duplicate-prefill.test.ts]). Deliberately omits:
 *   - **date/time** (`startsAt`/`endsAt`) — the host picks a new date; that's the
 *     whole point of duplicating.
 *   - **pricing** (`priceUsd`, fee flags) — Stripe-sensitive; the host re-enters
 *     it so a stale price can't silently ride along (Phase 2 scope decision).
 *   - **divisions repeater / by-position roster** — reconstructing the full
 *     payload is out of scope; the primary division's skill/capacity is enough
 *     to seed the common single-division case.
 *
 * The field keys mirror what the new-event form reads via `val(values, 'KEY')` /
 * `chk(values, …, 'KEY')` (see `new-event-form.tsx` and its `_components/`).
 */

/** Structural subset of `EventDetailReadModel` this mapper consumes. The
 *  new-event page passes the full read model; structural typing accepts it. */
export interface DuplicateSource {
  title: string;
  description: string;
  rules: string;
  type: string;
  surface: string;
  visibility: string;
  format: string | null;
  gender: string | null;
  location: {
    addressLine: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  divisions: ReadonlyArray<{
    skillTier: string;
    capacityKind: 'fixed' | 'unlimited' | null;
    maxSpots: number | null;
  }>;
}

export function buildDuplicatePrefill(event: DuplicateSource): Record<string, string> {
  const out: Record<string, string> = {
    title: event.title,
    description: event.description,
    rules: event.rules,
    type: event.type,
    surface: event.surface,
    visibility: event.visibility,
    addressLine: event.location.addressLine,
    city: event.location.city,
    region: event.location.region,
    postalCode: event.location.postalCode,
    country: event.location.country,
  };

  if (event.format) out.format = event.format;
  if (event.gender) out.gender = event.gender;

  // Capacity comes from the primary (first) division — ADR 0006 Phase 9b.
  // Only seed it for a fixed cap; unlimited / by-position fall back to the
  // form's default (Unlimited).
  const primary = event.divisions[0];
  if (primary) {
    out.skillTier = primary.skillTier;
    if (primary.capacityKind === 'fixed' && primary.maxSpots != null) {
      out.capacityKind = 'fixed';
      out.maxSpots = String(primary.maxSpots);
    }
  }

  return out;
}
