import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { Format, InvariantViolation, SkillLevel, Surface } from '@pickupvb/domain';

/**
 * AI-assisted extraction of community-listing drafts from pasted text (e.g. a
 * Facebook event copied to the clipboard). Used by the admin import tool
 * (`/admin/community-import`). The model only *parses* — it does not geocode
 * and does not resolve a timezone. Geocoding + timezone happen server-side at
 * import time via the same `geocodeAddress` / `timeZoneForCoords` pipeline the
 * manual create form uses, so an admin always reviews the result before it's
 * persisted. See `apps/web/src/app/community/new/actions.ts`.
 */

// Sonnet is accurate enough for date/location parsing and far cheaper than
// Opus for this occasional admin task. Bump to an Opus id if accuracy slips.
const MODEL = 'claude-sonnet-4-6';

const SURFACE_VALUES = Object.values(Surface) as Surface[];
const FORMAT_VALUES = Object.values(Format) as Format[];
const SKILL_VALUES = Object.values(SkillLevel) as SkillLevel[];

/**
 * A partial, *pre-geocode* listing. Mirrors the manual create form's fields:
 * `startsAtLocal` / `endsAtLocal` are naive wall-clock strings the
 * `DateTimePicker` can show; the address parts are free text that the import
 * action geocodes. Enum guesses are coerced to `null` when invalid.
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
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  surface: Surface | null;
  format: Format | null;
  skillLevel: SkillLevel | null;
};

// Static, cacheable system prompt — no per-request content (today's date and
// the pasted text go in the user turn) so the prefix stays byte-identical and
// the ephemeral cache can be reused across imports.
const SYSTEM_PROMPT = `You extract structured volleyball event/community listings from text a \
user pasted from an external source (most often a Facebook event, but also Meetup, \
Eventbrite, an Instagram post, or a plain blurb). The text may describe one event or several.

For each distinct event, emit one listing via the emit_listings tool. Rules:

- title: a concise event name (3-200 chars). Required.
- description: any extra detail — format, cost, what to bring, recurring schedule notes. Use '' if none.
- externalUrl: the public RSVP/sign-up URL if one appears in the text (must start with https://). \
Use '' if no URL is present — do NOT invent one.
- externalHostName: the hosting club/group/page name if stated, else null.
- startsAtLocal / endsAtLocal: the venue-local wall-clock time as 'YYYY-MM-DDTHH:mm' (24-hour). \
Do NOT include a timezone or offset. If the year is missing, choose the next future occurrence \
relative to the provided current date. endsAtLocal is null if no end time is given. \
startsAtLocal is '' only if no date/time can be determined at all.
- addressLine / city / region / postalCode / country: parse the venue address into parts. \
Use null for any part you can't determine. Country should be a name like 'United States'. \
Leave all five null if no location is given.
- surface: one of indoor | grass | sand, or null if unstated.
- format: one of sixes | quads | triples | doubles, or null if unstated.
- skillLevel: one of beginner | intermediate | advanced | competitive, or null if unstated.

Never fabricate facts not supported by the text. Prefer null over a guess for location, \
enums, and URLs. It's fine to infer the year for a date.`;

const EMIT_TOOL: Anthropic.Tool = {
  name: 'emit_listings',
  description: 'Return the structured listings parsed from the pasted text.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['listings'],
    properties: {
      listings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title'],
          properties: {
            title: { type: 'string', description: 'Event name, 3-200 chars.' },
            description: { type: 'string', description: "Extra detail, or '' if none." },
            externalUrl: {
              type: 'string',
              description: "Public RSVP URL (https://...), or '' if none in the text.",
            },
            externalHostName: { type: ['string', 'null'], description: 'Hosting group, or null.' },
            startsAtLocal: {
              type: 'string',
              description: "Local start as 'YYYY-MM-DDTHH:mm', or '' if undeterminable.",
            },
            endsAtLocal: {
              type: ['string', 'null'],
              description: "Local end as 'YYYY-MM-DDTHH:mm', or null.",
            },
            addressLine: { type: ['string', 'null'] },
            city: { type: ['string', 'null'] },
            region: { type: ['string', 'null'] },
            postalCode: { type: ['string', 'null'] },
            country: { type: ['string', 'null'] },
            surface: { type: ['string', 'null'], enum: [...SURFACE_VALUES, null] },
            format: { type: ['string', 'null'], enum: [...FORMAT_VALUES, null] },
            skillLevel: { type: ['string', 'null'], enum: [...SKILL_VALUES, null] },
          },
        },
      },
    },
  },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new InvariantViolation('ANTHROPIC_API_KEY is not configured.');
  }
  client = new Anthropic();
  return client;
}

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

/** Coerce one raw tool-output row into a fully-typed, defensive `ListingDraft`. */
export function coerceDraft(raw: unknown): ListingDraft {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    title: str(r.title),
    description: str(r.description),
    externalUrl: str(r.externalUrl),
    externalHostName: strOrNull(r.externalHostName),
    startsAtLocal: str(r.startsAtLocal),
    endsAtLocal: strOrNull(r.endsAtLocal),
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
 * Parse `rawText` into an array of listing drafts via Claude. Throws
 * `InvariantViolation` when the API key is missing, the API errors, or the
 * model returns no usable tool call — never a bare `Error` (so the HTTP
 * boundary maps it consistently).
 */
export async function extractListingDrafts(rawText: string): Promise<ListingDraft[]> {
  const text = rawText.trim();
  if (!text) return [];

  // Today's date is volatile, so it lives in the user turn — keeping the
  // system prompt (the cached prefix) byte-stable across imports.
  const today = new Date().toISOString().slice(0, 10);

  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [EMIT_TOOL],
      tool_choice: { type: 'tool', name: EMIT_TOOL.name },
      messages: [
        {
          role: 'user',
          content: `Current date: ${today}.\n\nPasted text:\n\n${text}`,
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Listing extraction failed.';
    throw new InvariantViolation(`Listing extraction request failed: ${message}`);
  }

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) {
    throw new InvariantViolation('Listing extraction returned no structured result.');
  }

  const input = toolUse.input as { listings?: unknown };
  const rows = Array.isArray(input.listings) ? input.listings : [];
  // Drop rows the model couldn't give a usable title — those are noise.
  return rows.map(coerceDraft).filter((d) => d.title.length >= 3);
}
