/**
 * Pure row → read-model mappers for `SupabaseEventRepository.getDetail`
 * (architecture audit P2-3). `getDetail` runs ~15 queries in two parallel
 * waves and used to assemble the ~80-field `EventDetailReadModel` inline,
 * which meant none of the parsing (waitlist computation, team/payment merge,
 * winner-label preference, spots math) could be unit-tested in pieces.
 *
 * Everything here is **pure**: rows in, read-model slices out, no Supabase
 * client, no I/O. The adapter keeps the query orchestration (and its
 * deliberate two-wave `Promise.all` batching) and delegates parsing to these
 * functions, so the batching is preserved while the logic gets a test seam.
 */
import {
  isEventPosition,
  type AttendeeLite,
  type CaptainedTeamLite,
  type Capacity,
  type EventPosition,
  type Format,
  type FreeAgentLite,
  type GroupLite,
  type ProfileLite,
  type TeamLite,
} from '@pickupvb/domain';

// ---- Raw PostgREST row shapes (projections used only by getDetail) ---------

/** Profile columns embedded on participant rows (no `id` — keyed by row owner). */
export type ParticipantProfileEmbed = {
  handle: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export type ProfileRow = { id: string } & ParticipantProfileEmbed;
export type GroupRow = { id: string; slug: string; name: string; avatar_url: string | null };

export type AttendeeRow = {
  user_id: string;
  joined_at: string;
  position: string | null;
  profiles: ParticipantProfileEmbed | null;
};

export type FreeAgentRow = {
  user_id: string;
  notes: string | null;
  division_id: string | null;
  joined_at: string;
  profiles: ParticipantProfileEmbed | null;
};

export type CoHostJoinRow = {
  host_user_id: string | null;
  host_group_id: string | null;
  profiles: ProfileRow | null;
  groups: GroupRow | null;
};

export type TeamJoinRow = {
  team_id: string;
  division_id: string | null;
  teams: {
    id: string;
    slug: string;
    name: string;
    format: Format;
    captain_id: string;
    captain: ProfileRow | null;
  } | null;
};

export type TeamPaymentRow = {
  team_id: string;
  payment_status: 'none' | 'pending' | 'paid' | 'refunded';
  amount_paid_cents: number | null;
};

export type ViewerTeamRow = { id: string; name: string; format: Format };

export type HostableGroupRow = { groups: { id: string; name: string } | null };

/** Embedded entry row used to resolve a division winner's display label. */
export type WinnerEntryRow = {
  id: string;
  display_name: string;
  team_id: string | null;
  teams: { name: string } | null;
};

// ---- Profile / group mappers -----------------------------------------------

export function toProfileLite(p: ProfileRow): ProfileLite {
  return {
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    firstName: p.first_name,
    lastName: p.last_name,
    avatarUrl: p.avatar_url,
  };
}

export function toGroupLite(g: GroupRow): GroupLite {
  return {
    id: g.id,
    slug: g.slug,
    name: g.name,
    avatarUrl: g.avatar_url,
  };
}

/**
 * Build a `ProfileLite` for a participant (attendee / free agent) row, where
 * the profile embed may be null (e.g. an anonymous or deleted account). Falls
 * back to the user id for the handle and a generic display name so the UI
 * always has something to render.
 */
function participantProfile(userId: string, p: ParticipantProfileEmbed | null): ProfileLite {
  return {
    id: userId,
    handle: p?.handle ?? userId,
    displayName: p?.display_name ?? 'Player',
    firstName: p?.first_name ?? null,
    lastName: p?.last_name ?? null,
    avatarUrl: p?.avatar_url ?? null,
  };
}

// ---- Attendees (waitlist + per-position fill) ------------------------------

/**
 * Map attendee rows to `AttendeeLite[]`, computing the waitlist flag and the
 * per-position fill counts in a single chronological pass. Rows MUST arrive
 * ordered by `joined_at` ascending: the running per-position count is compared
 * against the configured `positionRoster` target, so the earliest signups keep
 * their seat and later ones over the target are waitlisted. `filledByPosition`
 * is returned so the read model can surface `filled / target` per slot without
 * the consumer re-walking the attendees array.
 */
export function mapAttendees(
  rows: ReadonlyArray<AttendeeRow>,
  positionRoster: ReadonlyMap<EventPosition, number> | null,
): { attendees: AttendeeLite[]; filledByPosition: Map<EventPosition, number> } {
  const filledByPosition = new Map<EventPosition, number>();
  const attendees: AttendeeLite[] = rows.map((a) => {
    const pos = isEventPosition(a.position) ? a.position : null;
    let waitlist = false;
    if (pos) {
      const next = (filledByPosition.get(pos) ?? 0) + 1;
      filledByPosition.set(pos, next);
      if (positionRoster) {
        const target = positionRoster.get(pos) ?? 0;
        waitlist = next > target;
      }
    }
    return {
      userId: a.user_id,
      joinedAt: new Date(a.joined_at),
      position: pos,
      waitlist,
      profile: participantProfile(a.user_id, a.profiles),
    };
  });
  return { attendees, filledByPosition };
}

// ---- Free agents -----------------------------------------------------------

export function mapFreeAgents(rows: ReadonlyArray<FreeAgentRow>): FreeAgentLite[] {
  return rows.map((f) => ({
    userId: f.user_id,
    notes: f.notes,
    divisionId: f.division_id,
    joinedAt: new Date(f.joined_at),
    profile: participantProfile(f.user_id, f.profiles),
  }));
}

// ---- Co-hosts --------------------------------------------------------------

/**
 * Split co-host join rows into user co-hosts and group co-hosts.
 * `coGroupIds` is surfaced so the viewer's hostable-group list can exclude
 * groups that are already co-hosting (see {@link mapViewerHostableGroups}).
 */
export function mapCoHosts(rows: ReadonlyArray<CoHostJoinRow>): {
  coHostUsers: ProfileLite[];
  coHostGroups: GroupLite[];
  coGroupIds: string[];
} {
  const coHostUsers = rows
    .map((r) => r.profiles)
    .filter((p): p is ProfileRow => p !== null)
    .map(toProfileLite);
  const coHostGroups = rows
    .map((r) => r.groups)
    .filter((g): g is GroupRow => g !== null)
    .map(toGroupLite);
  const coGroupIds = rows.map((r) => r.host_group_id).filter((v): v is string => !!v);
  return { coHostUsers, coHostGroups, coGroupIds };
}

// ---- Registered tournament teams -------------------------------------------

/** Count members per team from `{ team_id }` rows. */
export function tallyTeamMembers(rows: ReadonlyArray<{ team_id: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of rows) counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1);
  return counts;
}

/** Index per-team payment rows by `team_id` (last write wins). */
export function indexPaymentsByTeam(
  rows: ReadonlyArray<TeamPaymentRow>,
): Map<string, TeamPaymentRow> {
  const byTeam = new Map<string, TeamPaymentRow>();
  for (const p of rows) byTeam.set(p.team_id, p);
  return byTeam;
}

/**
 * Build the registered-team list, merging each team's roster size and sidecar
 * payment state (ADR 0007). Captain profile is already attached to each row via
 * the JOIN; division is read from the entry row. Rows without an embedded team
 * (RLS-filtered / deleted) are dropped.
 */
export function mapRegisteredTeams(
  rows: ReadonlyArray<TeamJoinRow>,
  memberCounts: ReadonlyMap<string, number>,
  paymentsByTeam: ReadonlyMap<string, TeamPaymentRow>,
): TeamLite[] {
  return rows
    .filter((r): r is TeamJoinRow & { teams: NonNullable<TeamJoinRow['teams']> } => !!r.teams)
    .map((r) => {
      const t = r.teams;
      const pay = paymentsByTeam.get(t.id);
      return {
        teamId: t.id,
        slug: t.slug,
        name: t.name,
        format: t.format,
        captainId: t.captain_id,
        captain: t.captain ? toProfileLite(t.captain) : null,
        memberCount: memberCounts.get(t.id) ?? 0,
        divisionId: r.division_id ?? null,
        payment: pay
          ? { status: pay.payment_status, amountPaidCents: pay.amount_paid_cents }
          : null,
      };
    });
}

// ---- Viewer's captained teams ----------------------------------------------

export function mapViewerCaptainedTeams(
  rows: ReadonlyArray<ViewerTeamRow>,
  memberCounts: ReadonlyMap<string, number>,
  registeredTeamIds: ReadonlySet<string>,
): CaptainedTeamLite[] {
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    format: t.format,
    memberCount: memberCounts.get(t.id) ?? 0,
    isRegistered: registeredTeamIds.has(t.id),
  }));
}

// ---- Viewer's hostable groups ----------------------------------------------

/**
 * Groups the viewer owns/admins that could host this event, excluding the
 * event's current primary host group and any group already co-hosting.
 */
export function mapViewerHostableGroups(
  rows: ReadonlyArray<HostableGroupRow>,
  hostGroupId: string | null,
  coGroupIds: ReadonlyArray<string>,
): Array<{ id: string; name: string }> {
  return rows
    .map((r) => r.groups)
    .filter((g): g is { id: string; name: string } => g !== null)
    .filter((g) => g.id !== hostGroupId && !coGroupIds.includes(g.id));
}

// ---- Division winner labels ------------------------------------------------

/**
 * Resolve each division's winner label from its `winner_entry_id`. The entry
 * carries `display_name` for ad-hoc / walk-in rows; for roster entries we
 * prefer the live `teams.name` when present (matches the legacy behaviour
 * after the `winner_entry_id` collapse). Divisions with no winner, or whose
 * entry row didn't come back, are omitted from the result.
 */
export function mapWinnerLabels(
  divisions: ReadonlyArray<{ id: string; winner_entry_id: string | null }>,
  entryRows: ReadonlyArray<WinnerEntryRow>,
): Map<string, string> {
  const byEntryId = new Map<string, string>(
    entryRows.map((r) => [r.id, r.teams?.name ?? r.display_name]),
  );
  const out = new Map<string, string>();
  for (const d of divisions) {
    if (d.winner_entry_id) {
      const label = byEntryId.get(d.winner_entry_id);
      if (label) out.set(d.id, label);
    }
  }
  return out;
}

// ---- Spots remaining -------------------------------------------------------

/**
 * Compute remaining spots. Positional events sum the configured per-position
 * targets; otherwise fall back to the capacity value object (unlimited → null).
 * Never returns a negative number.
 */
export function computeSpotsRemaining(
  positionRoster: ReadonlyMap<EventPosition, number> | null,
  capacity: Capacity | null,
  attendeeCount: number,
): number | null {
  if (positionRoster) {
    const target = Array.from(positionRoster.values()).reduce((a, b) => a + b, 0);
    return Math.max(0, target - attendeeCount);
  }
  if (!capacity) return null;
  if (capacity.kind === 'unlimited') return null;
  return Math.max(0, (capacity.maxSpots ?? 0) - attendeeCount);
}
