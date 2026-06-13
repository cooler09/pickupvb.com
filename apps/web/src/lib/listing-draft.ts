import { Format, SkillLevel, Surface } from '@pickupvb/domain';

/**
 * A partial, *pre-geocode* community-listing draft. Mirrors the manual create
 * form's fields: `startsAtLocal` / `endsAtLocal` are naive wall-clock strings
 * the `DateTimePicker` can show; the address parts are free text the import
 * action geocodes. Enum guesses are coerced to `null` when invalid.
 *
 * This is the contract between the `facebook-events-import` Claude Code skill
 * (which emits an array of these as JSON) and the admin importer
 * (`/admin/community-import`), which geocodes + validates + persists each one.
 * Kept framework-free (no `server-only`) so the client importer can sanitize an
 * uploaded file before handing the drafts to the import server action.
 */
export type ListingDraft = {
  title: string;
  description: string;
  /** The external RSVP link (FB event, Meetup, …). '' when none was found. */
  externalUrl: string;
  externalHostName: string | null;
  /** Naive local datetime, 'YYYY-MM-DDTHH:mm'. '' when not found. */
  startsAtLocal: string;
  endsAtLocal: string | null;
  /**
   * True when only the date is known (no published start time). The importer
   * anchors the time to noon venue-local and the listing renders date-only.
   * Defaults to false.
   */
  allDay: boolean;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  surface: Surface | null;
  format: Format | null;
  skillLevel: SkillLevel | null;
};

const SURFACE_VALUES = Object.values(Surface) as Surface[];
const FORMAT_VALUES = Object.values(Format) as Format[];
const SKILL_VALUES = Object.values(SkillLevel) as SkillLevel[];

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strOrNull(value: unknown): string | null {
  const s = str(value);
  return s ? s : null;
}

function enumOrNull<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** Coerce one raw row (untrusted JSON) into a fully-typed, defensive `ListingDraft`. */
export function coerceDraft(raw: unknown): ListingDraft {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    title: str(r.title),
    description: str(r.description),
    externalUrl: str(r.externalUrl),
    externalHostName: strOrNull(r.externalHostName),
    startsAtLocal: str(r.startsAtLocal),
    endsAtLocal: strOrNull(r.endsAtLocal),
    allDay: r.allDay === true,
    addressLine: strOrNull(r.addressLine),
    city: strOrNull(r.city),
    region: strOrNull(r.region),
    postalCode: strOrNull(r.postalCode),
    country: strOrNull(r.country),
    surface: enumOrNull(r.surface, SURFACE_VALUES),
    format: enumOrNull(r.format, FORMAT_VALUES),
    skillLevel: enumOrNull(r.skillLevel, SKILL_VALUES),
  };
}

/**
 * Parse uploaded/pasted JSON (produced by the `facebook-events-import` skill)
 * into typed, sanitized drafts. Accepts either a bare array of drafts or an
 * object with a top-level `listings` array. Throws a human-readable `Error` on
 * malformed JSON, a non-array payload, or a set with no usable titles — so the
 * admin sees a clear message instead of a stack trace. The server re-validates
 * every field with Zod at import time; this is the first, friendlier gate.
 */
export function parseDraftsJson(text: string): ListingDraft[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('No JSON provided.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  const listings = (parsed as { listings?: unknown } | null)?.listings;
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(listings) ? listings : null;
  if (!rows) {
    throw new Error('Expected a JSON array of listings (or a { "listings": [...] } object).');
  }

  // Drop rows the skill couldn't give a usable title — those are noise.
  const drafts = rows.map(coerceDraft).filter((d) => d.title.length >= 3);
  if (drafts.length === 0) {
    throw new Error('No listings with a usable title (3+ characters) were found in that JSON.');
  }
  return drafts;
}
