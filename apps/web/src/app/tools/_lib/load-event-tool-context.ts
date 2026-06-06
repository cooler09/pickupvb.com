import 'server-only';
import { getViewer } from '@/lib/server-auth';
import { repositories } from '@/lib/handlers';
import { loadEventDetail } from '@/app/events/[id]/_loaders/load-event-detail';
import { DivisionId, EventId } from '@pickupvb/domain';
import type { EventToolBinding } from './event-binding';

/**
 * Server-side event context for a bound host tool (tools/_lib/event-binding.ts).
 *
 * Loads the event's roster + the resolved division's registered teams so the
 * tool can pre-fill, and resolves the display labels for the banner. Returns
 * `null` — meaning "render the plain free tool" — when the event is missing or
 * the viewer can't manage it, so a non-host who hand-crafts a `?event=` URL sees
 * the generic tool with no event data and no save action (the write-back
 * commands re-check authorization regardless). See
 * docs/audits/tournament-tools-workflow.md (TT-2 / authorization).
 */
export interface EventToolContext {
  binding: EventToolBinding;
  eventTitle: string;
  eventType: 'tournament' | 'league' | 'open_play';
  /** Resolved division (the bound one, else the event's first). Null when the
   *  event has no divisions yet. */
  divisionId: string | null;
  divisionLabel: string | null;
  /** Active (non-waitlisted) attendee display names — roster for the randomizer. */
  rosterNames: string[];
  /** The resolved division's registered teams (entry id + name) — for
   *  seeding / scheduler / standings. Empty when no division. */
  teams: ReadonlyArray<{ entryId: string; name: string }>;
  /** Ad-hoc divisions on the event — valid targets for the randomizer's
   *  "save as ad-hoc teams" write-back (RegisterAdHocTeamCommand). */
  adHocDivisions: ReadonlyArray<{ id: string; label: string }>;
}

export async function loadEventToolContext(
  binding: EventToolBinding,
): Promise<EventToolContext | null> {
  const viewer = await getViewer();

  let vm;
  try {
    vm = await loadEventDetail(binding.eventId, viewer);
  } catch {
    return null;
  }
  const event = vm.event;
  if (!event.canManage) return null;

  const division =
    (binding.divisionId ? event.divisions.find((d) => d.id === binding.divisionId) : undefined) ??
    event.divisions[0] ??
    null;

  const rosterNames = event.attendees
    .filter((a) => !a.waitlist)
    .map((a) => a.profile.displayName || a.profile.handle || 'Player');

  let teams: ReadonlyArray<{ entryId: string; name: string }> = [];
  if (division) {
    const registered = await repositories.bracketRepo.listRegisteredTeams(
      EventId(event.id),
      DivisionId(division.id),
    );
    teams = registered.map((t) => ({ entryId: t.entryId, name: t.name }));
  }

  const adHocDivisions = event.divisions
    .filter((d) => d.teamRegistrationMode === 'ad_hoc')
    .map((d) => ({ id: d.id, label: d.label }));

  return {
    binding,
    eventTitle: event.title,
    eventType: event.type as EventToolContext['eventType'],
    divisionId: division?.id ?? null,
    divisionLabel: division?.label ?? null,
    rosterNames,
    teams,
    adHocDivisions,
  };
}
