/**
 * Event tool binding — the generalization of the scoreboard's `MatchBinding`
 * ([scoreboard/_lib/binding.ts](../scoreboard/_lib/binding.ts)) to the rest of
 * the host tools (team randomizer, seeding, scheduler, standings).
 *
 * When a tool is launched from an event's manage dashboard / bracket page, the
 * event (and optionally the division) travels as a query string on the
 * `/tools/<slug>` URL. The tool's server `page.tsx` parses it, loads the event's
 * roster/teams server-side (gated on `event.canManage`), and the tool offers a
 * "Save to event" affordance backed by an existing domain command. Absent the
 * binding the tool is the plain, no-signup free utility — byte-identical to
 * today. See docs/audits/tournament-tools-workflow.md (TT-2).
 */
import type { Route } from 'next';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EventToolBinding {
  eventId: string;
  /** Division scope for the division-bound tools (seeding/scheduler/standings). */
  divisionId?: string;
  /** Where to send the host back to (and revalidate) after acting. */
  ret: string;
}

/**
 * Display labels resolved server-side and handed to a client island so it can
 * render the "Connected to your event" banner + save action without re-fetching.
 */
export interface EventBindingView extends EventToolBinding {
  eventTitle: string;
  divisionLabel?: string;
}

type SearchParams = Record<string, string | string[] | undefined> | undefined;

function pick(sp: SearchParams, key: string): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Parse the `?event=&division=&ret=` binding from a tool page's `searchParams`.
 * Returns `null` (→ plain free tool) unless a syntactically valid event UUID is
 * present, so bots / garbage params never trigger an event load. `ret` is
 * accepted only when it's an app-relative path (leading `/`) to avoid an
 * open-redirect; otherwise it falls back to the event's manage page.
 */
export function parseEventBinding(sp: SearchParams): EventToolBinding | null {
  const eventId = pick(sp, 'event');
  if (!eventId || !UUID_RE.test(eventId)) return null;

  const divisionRaw = pick(sp, 'division');
  const divisionId = divisionRaw && UUID_RE.test(divisionRaw) ? divisionRaw : undefined;

  // Accept only an app-relative path. Reject protocol-relative `//host` (an
  // open-redirect vector that also starts with `/`) and anything off-site.
  const retRaw = pick(sp, 'ret');
  const ret =
    retRaw && retRaw.startsWith('/') && !retRaw.startsWith('//')
      ? retRaw
      : `/events/${eventId}/manage`;

  return { eventId, ...(divisionId ? { divisionId } : {}), ret };
}

/** Build a `/tools/<slug>?event=&division=&ret=` launch href for a host surface. */
export function eventToolHref(
  slug: string,
  binding: { eventId: string; divisionId?: string; ret: string },
): Route {
  const params = new URLSearchParams({ event: binding.eventId, ret: binding.ret });
  if (binding.divisionId) params.set('division', binding.divisionId);
  return `/tools/${slug}?${params.toString()}` as Route;
}
