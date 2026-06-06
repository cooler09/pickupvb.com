import type { Division, VolleyballEvent } from '@pickupvb/domain';
import type { createSupabaseAdminClient, TablesInsert } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Child-row reconcilers for `SupabaseEventRepository.save()` (architecture audit
 * P2-2). `save()` persists a `VolleyballEvent` as the `events` row plus several
 * independent child tables, each reconciled by delta against current DB state.
 * Those blocks live here as focused functions so the adapter's `save()` is a
 * readable orchestrator rather than a ~330-LOC method.
 *
 * Every function is a **verbatim** extraction of the original inline block —
 * same queries, same order, same error messages — so the
 * [characterization test](./supabase-event-repository.test.ts) that pins the
 * write sequence stays green. They run on the **service-role** client `save()`
 * already uses (host already authorized in the application layer); the writes
 * are still sequential and **not** transactional — true multi-statement
 * atomicity (a SECURITY DEFINER RPC) is the remaining P2-2 follow-up.
 */

// Sentinel so an empty `divisionIds` list still produces a well-formed
// `.in('division_id', …)` filter that matches nothing (rather than erroring).
const NO_DIVISION = '00000000-0000-0000-0000-000000000000';

/** Map a `Division` aggregate to its `event_divisions` row shape. */
export function divisionToRow(eventId: string, d: Division): Record<string, unknown> {
  return {
    id: String(d.id),
    event_id: eventId,
    sort_order: d.sortOrder,
    label: d.label,
    surface: d.surface,
    format: d.format,
    gender: d.gender,
    skill_tier: d.skillTier,
    age_group: d.ageGroup,
    tier_label: d.tierLabel,
    team_composition: d.teamComposition,
    team_size: d.teamSize,
    capacity_kind: d.capacity?.kind ?? null,
    max_spots: d.capacity?.kind === 'fixed' ? d.capacity.maxSpots : null,
    price_cents: d.priceCents,
    price_unit: d.priceUnit,
    prize_text: d.prizeText,
    prize_purse_cents: d.prizePurseCents,
    starts_at: d.startsAt ? d.startsAt.toISOString() : null,
    ends_at: d.endsAt ? d.endsAt.toISOString() : null,
    allow_free_agents: d.allowFreeAgents,
    team_registration_mode: d.teamRegistrationMode,
  };
}

/**
 * Load the event's division ids. Returns the full list plus the `soleDivisionId`
 * (non-null only when the event has exactly one division) that the child inserts
 * fall back to for division-less aggregate entries.
 */
export async function loadDivisionIds(
  client: SupabaseClient,
  eventId: string,
): Promise<{ divisionIds: string[]; soleDivisionId: string | null }> {
  const { data: divIdRows, error: divIdErr } = await client
    .from('event_divisions')
    .select('id')
    .eq('event_id', eventId);
  if (divIdErr) throw new Error(`save divisions load failed: ${divIdErr.message}`);
  const divisionIds = ((divIdRows as Array<{ id: string }> | null) ?? []).map((r) => r.id);
  const soleDivisionId = divisionIds.length === 1 ? divisionIds[0]! : null;
  return { divisionIds, soleDivisionId };
}

/**
 * Reconcile attendees by delta. The aggregate's `_attendees` Map carries
 * (userId, position) but NOT `division_id` — that's chosen at signup time and
 * stored on the DB row. After Step 5a the tables no longer carry `event_id`, so
 * reads/writes are scoped through the event's division ids:
 *   * Read current rows via `.in('division_id', divisionIds)`.
 *   * Delete only rows no longer in the aggregate.
 *   * Insert only rows newly added (open-play is single-division by invariant,
 *     so a new attendee uses `soleDivisionId`; multi-division events have their
 *     attendees written by the ticket-checkout flow, so skip here).
 *   * UPDATE rows whose position changed.
 */
export async function reconcileAttendees(
  client: SupabaseClient,
  event: VolleyballEvent,
  divisionIds: string[],
  soleDivisionId: string | null,
): Promise<void> {
  const { data: existingAttendeeRows, error: selAErr } = await client
    .from('event_participants')
    .select('user_id, position')
    .eq('role', 'attendee')
    .in('division_id', divisionIds.length > 0 ? divisionIds : [NO_DIVISION]);
  if (selAErr) throw new Error(`save attendees load failed: ${selAErr.message}`);
  const existingAttendees = new Map<string, string | null>(
    (
      (existingAttendeeRows as Array<{ user_id: string; position: string | null }> | null) ?? []
    ).map((r) => [r.user_id, r.position]),
  );
  const desiredAttendees = new Map<string, string | null>(
    Array.from(event.attendees.entries()).map(([u, position]) => [String(u), position]),
  );
  const attendeesToDelete: string[] = [];
  for (const userId of existingAttendees.keys()) {
    if (!desiredAttendees.has(userId)) attendeesToDelete.push(userId);
  }
  const attendeesToInsert: Array<{
    division_id: string;
    user_id: string;
    position: string | null;
  }> = [];
  const attendeesToUpdate: Array<{ user_id: string; position: string | null }> = [];
  for (const [userId, position] of desiredAttendees.entries()) {
    if (!existingAttendees.has(userId)) {
      // Multi-division events: dedicated handlers (the ticket-purchase checkout
      // flow) write event_attendees rows directly with the chosen division_id.
      // Skip the aggregate-driven insert here so re-saving the aggregate after
      // such a write doesn't try to duplicate the row in the wrong division.
      if (!soleDivisionId) continue;
      attendeesToInsert.push({ division_id: soleDivisionId, user_id: userId, position });
    } else if (existingAttendees.get(userId) !== position) {
      attendeesToUpdate.push({ user_id: userId, position });
    }
  }
  if (attendeesToDelete.length > 0) {
    const { error: delErr } = await client
      .from('event_participants')
      .delete()
      .eq('role', 'attendee')
      .in('division_id', divisionIds)
      .in('user_id', attendeesToDelete);
    if (delErr) throw new Error(`save attendees delete failed: ${delErr.message}`);
  }
  if (attendeesToInsert.length > 0) {
    const rows = attendeesToInsert.map((a) => ({ ...a, role: 'attendee' as const }));
    const { error: insErr } = await client.from('event_participants').insert(rows);
    if (insErr) throw new Error(`save attendees insert failed: ${insErr.message}`);
  }
  for (const row of attendeesToUpdate) {
    const { error: updErr } = await client
      .from('event_participants')
      .update({ position: row.position })
      .eq('role', 'attendee')
      .in('division_id', divisionIds)
      .eq('user_id', row.user_id);
    if (updErr) throw new Error(`save attendees update failed: ${updErr.message}`);
  }
}

/**
 * Reconcile the capacity waitlist (event-level, ADR 0036) by delta. Inserts take
 * `created_at = now()` so FIFO order survives across saves (each join is its own
 * save). A delete covers both leaving the queue and being promoted — a promoted
 * user drops out of `event.waitlist` and appears in `event.attendees` (inserted
 * by {@link reconcileAttendees}) in the same save.
 */
export async function reconcileWaitlist(
  client: SupabaseClient,
  event: VolleyballEvent,
  eventId: string,
): Promise<void> {
  const { data: existingWaitRows, error: selWErr } = await client
    .from('event_waitlist')
    .select('user_id')
    .eq('event_id', eventId);
  if (selWErr) throw new Error(`save waitlist load failed: ${selWErr.message}`);
  const existingWait = new Set(
    ((existingWaitRows as Array<{ user_id: string }> | null) ?? []).map((r) => r.user_id),
  );
  const desiredWait = event.waitlist.map((u) => String(u));
  const desiredWaitSet = new Set(desiredWait);
  const waitToDelete = [...existingWait].filter((u) => !desiredWaitSet.has(u));
  const waitToInsert = desiredWait.filter((u) => !existingWait.has(u));
  if (waitToDelete.length > 0) {
    const { error: delWErr } = await client
      .from('event_waitlist')
      .delete()
      .eq('event_id', eventId)
      .in('user_id', waitToDelete);
    if (delWErr) throw new Error(`save waitlist delete failed: ${delWErr.message}`);
  }
  if (waitToInsert.length > 0) {
    const rows = waitToInsert.map((user_id) => ({ event_id: eventId, user_id }));
    const { error: insWErr } = await client.from('event_waitlist').insert(rows);
    if (insWErr) throw new Error(`save waitlist insert failed: ${insWErr.message}`);
  }
}

/**
 * Reconcile the roster-mode entries in `event_team_entries`, scoped through
 * `divisionIds`. Each desired entry carries its own division (ADR 0019), so
 * inserts work for single- and multi-division events alike — they route through
 * the `attach_team_to_division` RPC, which resolves captain/name and honours the
 * partial unique index via INSERT … ON CONFLICT DO NOTHING. Ad-hoc / walk-in
 * entries are owned by the `EventTeamRegistration` aggregate and are skipped.
 */
export async function reconcileRosterTeams(
  client: SupabaseClient,
  event: VolleyballEvent,
  divisionIds: string[],
  soleDivisionId: string | null,
): Promise<void> {
  const desiredTeamDivision = new Map(
    event.teamEntries.map(([t, d]) => [String(t), d ? String(d) : null] as const),
  );
  const desiredTeams = new Set(desiredTeamDivision.keys());
  const { data: existingTeamRows, error: selTErr } = await client
    .from('event_team_entries')
    .select('team_id')
    .eq('source', 'roster')
    .is('deleted_at', null)
    .in('division_id', divisionIds.length > 0 ? divisionIds : [NO_DIVISION]);
  if (selTErr) throw new Error(`save teams load failed: ${selTErr.message}`);
  const existingTeams = new Set(
    ((existingTeamRows as Array<{ team_id: string | null }> | null) ?? [])
      .map((r) => r.team_id)
      .filter((v): v is string => !!v),
  );
  const teamsToDelete = Array.from(existingTeams).filter((t) => !desiredTeams.has(t));
  const teamsToInsert = Array.from(desiredTeams).filter((t) => !existingTeams.has(t));
  if (teamsToDelete.length > 0) {
    const { error: delTErr } = await client
      .from('event_team_entries')
      .delete()
      .eq('source', 'roster')
      .in('division_id', divisionIds)
      .in('team_id', teamsToDelete);
    if (delTErr) throw new Error(`save teams delete failed: ${delTErr.message}`);
  }
  for (const teamId of teamsToInsert) {
    // Per-entry division (ADR 0019); fall back to the sole division for legacy
    // rows that carry none.
    const teamDivisionId = desiredTeamDivision.get(teamId) ?? soleDivisionId;
    if (!teamDivisionId) continue;
    const { error: insTErr } = await client.rpc('attach_team_to_division', {
      p_division_id: teamDivisionId,
      p_team_id: teamId,
    });
    if (insTErr) throw new Error(`save teams insert failed: ${insTErr.message}`);
  }
}

/** Reconcile free agents — delta on membership + a notes update. */
export async function reconcileFreeAgents(
  client: SupabaseClient,
  event: VolleyballEvent,
  divisionIds: string[],
  soleDivisionId: string | null,
): Promise<void> {
  const { data: existingFaRows, error: selFErr } = await client
    .from('event_participants')
    .select('user_id, notes')
    .eq('role', 'free_agent')
    .in('division_id', divisionIds.length > 0 ? divisionIds : [NO_DIVISION]);
  if (selFErr) throw new Error(`save free agents load failed: ${selFErr.message}`);
  const existingFa = new Map<string, string | null>(
    ((existingFaRows as Array<{ user_id: string; notes: string | null }> | null) ?? []).map((r) => [
      r.user_id,
      r.notes,
    ]),
  );
  const desiredFa = new Map<string, { divisionId: string | null; notes: string | null }>(
    event.freeAgentEntries.map(([u, e]) => [
      String(u),
      { divisionId: e.divisionId ? String(e.divisionId) : null, notes: e.notes },
    ]),
  );
  const faToDelete: string[] = [];
  for (const userId of existingFa.keys()) {
    if (!desiredFa.has(userId)) faToDelete.push(userId);
  }
  const faToInsert: Array<{ division_id: string; user_id: string; notes: string | null }> = [];
  const faToUpdate: Array<{ user_id: string; notes: string | null }> = [];
  for (const [userId, entry] of desiredFa.entries()) {
    if (!existingFa.has(userId)) {
      // Per-entry division (ADR 0019); fall back to the sole division for legacy
      // rows that carry none.
      const faDivisionId = entry.divisionId ?? soleDivisionId;
      if (!faDivisionId) continue;
      faToInsert.push({ division_id: faDivisionId, user_id: userId, notes: entry.notes });
    } else if (existingFa.get(userId) !== entry.notes) {
      faToUpdate.push({ user_id: userId, notes: entry.notes });
    }
  }
  if (faToDelete.length > 0) {
    const { error: delFErr } = await client
      .from('event_participants')
      .delete()
      .eq('role', 'free_agent')
      .in('division_id', divisionIds)
      .in('user_id', faToDelete);
    if (delFErr) throw new Error(`save free agents delete failed: ${delFErr.message}`);
  }
  if (faToInsert.length > 0) {
    const rows = faToInsert.map((f) => ({ ...f, role: 'free_agent' as const }));
    // Plain insert (not upsert): the only unique index on (division_id, user_id)
    // is *partial* — `where user_id is not null` (migration 20260802000000).
    // PostgREST's `onConflict` can't carry the index predicate a partial index
    // requires for ON CONFLICT inference, so an upsert here raised 42P10 and
    // broke every free-agent signup. The partial index still enforces uniqueness
    // on the insert, so a concurrent double-submit raises 23505 (unique_violation)
    // — which we swallow to keep the operation idempotent (matches the removed
    // attachFreeAgentToDivision behaviour — ADR 0019).
    const { error: insFErr } = await client.from('event_participants').insert(rows);
    if (insFErr && insFErr.code !== '23505') {
      throw new Error(`save free agents insert failed: ${insFErr.message}`);
    }
  }
  for (const row of faToUpdate) {
    const { error: updErr } = await client
      .from('event_participants')
      .update({ notes: row.notes })
      .eq('role', 'free_agent')
      .in('division_id', divisionIds)
      .eq('user_id', row.user_id);
    if (updErr) throw new Error(`save free agents update failed: ${updErr.message}`);
  }
}

/**
 * Reconcile divisions: upsert the current set by id, delete any id no longer
 * present (child rows with that `division_id` go to NULL via `on delete set
 * null` and may be re-resolved by the `fill_default_division_id` trigger when
 * the event has exactly one remaining division).
 *
 * When the aggregate carries no divisions (legacy create path that pre-dates
 * multi-division) we skip the delete entirely so the
 * `events_create_default_division` AFTER INSERT trigger's row stays put.
 * Reconciliation only runs when the caller explicitly listed divisions.
 */
export async function reconcileDivisions(
  client: SupabaseClient,
  event: VolleyballEvent,
): Promise<void> {
  const eventIdStr = String(event.id);
  const divisionRows = event.divisions.map((d) => divisionToRow(eventIdStr, d));
  if (divisionRows.length === 0) return;
  // Stamp the aggregate-level `positionRoster` onto the primary division row.
  // Open-play events are single-division by invariant (P1 #3); tournament/league
  // divisions carry null.
  const primary = divisionRows[0] as Record<string, unknown>;
  primary.position_roster = event.positionRoster
    ? Object.fromEntries(event.positionRoster.entries())
    : null;
  const { error: upErr } = await client
    .from('event_divisions')
    .upsert(divisionRows as TablesInsert<'event_divisions'>[], { onConflict: 'id' });
  if (upErr) throw new Error(`save divisions upsert failed: ${upErr.message}`);
  const keepIds = event.divisions.map((d) => String(d.id));
  const { error: delDivErr } = await client
    .from('event_divisions')
    .delete()
    .eq('event_id', eventIdStr)
    .not('id', 'in', `(${keepIds.join(',')})`);
  if (delDivErr) throw new Error(`save divisions delete failed: ${delDivErr.message}`);
}
