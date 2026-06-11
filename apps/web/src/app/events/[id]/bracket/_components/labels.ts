import type { BracketFormat } from '@pickupvb/domain';

/**
 * Mirrors the shape of `BracketTeamLite` returned by the domain repo:
 * `teamId` is null for ad-hoc / walk-in entries (no persistent `teams`
 * row), and `captainId` is null for walk-in entries (no captain user
 * account). The `entryId` is always populated and is the right key for
 * bracket seed / match lookups post the 2026-12-04 cutover.
 */
export type TeamLite = {
  teamId: string | null;
  entryId: string;
  name: string;
  captainId: string | null;
};

/**
 * Identifies which bracket a reused `_components` view is acting on. An event
 * bracket carries `eventId` + `divisionId`; a standalone bracket (ADR 0025)
 * carries `bracketId`. The view components default to the event scope from
 * their existing `eventId`/`divisionId` props, so event call sites are
 * unchanged; standalone routes pass `scope` explicitly. See
 * `bracket-action-binding.ts` for how this resolves to bound server actions.
 */
export type BracketScope =
  | { kind: 'event'; eventId: string; divisionId: string }
  | { kind: 'standalone'; bracketId: string };

export const FORMAT_LABEL: Record<BracketFormat, string> = {
  single_elimination: 'Single elimination',
  double_elimination: 'Double elimination',
  round_robin: 'Round robin',
  pool_play_playoff: 'Pool play → playoff',
};

export const NOTICE_LABEL: Record<string, { tone: 'success' | 'error'; text: string }> = {
  created: { tone: 'success', text: 'Bracket created.' },
  seeded: { tone: 'success', text: 'Seeding saved.' },
  generated: { tone: 'success', text: 'Bracket generated.' },
  playoff_generated: { tone: 'success', text: 'Playoff bracket generated.' },
  playoff_reseeded: { tone: 'success', text: 'Playoff re-seeded.' },
  reset: { tone: 'success', text: 'Bracket reset to setup.' },
  bracket_deleted: { tone: 'success', text: 'Bracket deleted. Pick a format to start over.' },
  published: { tone: 'success', text: 'Bracket published — scoring is now live.' },
  match_updated: { tone: 'success', text: 'Match updated.' },
  match_added: { tone: 'success', text: 'Match added.' },
  match_removed: { tone: 'success', text: 'Match removed.' },
  pools_updated: { tone: 'success', text: 'Pools updated and schedule rebuilt.' },
  reopened: { tone: 'success', text: 'Bracket re-opened for editing.' },
  entry_replaced: { tone: 'success', text: 'Team substituted across the bracket.' },
  result_saved: { tone: 'success', text: 'Result recorded.' },
  match_reset: { tone: 'success', text: 'Match cleared.' },
  team_added: {
    tone: 'success',
    text: 'Team added to this division. Reorder and save seeding to include it.',
  },
  team_name_required: { tone: 'error', text: 'Team name is required.' },
  forbidden: { tone: 'error', text: 'You do not have permission for that action.' },
  conflict: { tone: 'error', text: 'Conflict.' },
  notfound: { tone: 'error', text: 'Not found.' },
  invalid: { tone: 'error', text: 'Invalid input.' },
  error: { tone: 'error', text: 'Something went wrong.' },
  cap: { tone: 'error', text: 'Bracket limit reached.' },
};
