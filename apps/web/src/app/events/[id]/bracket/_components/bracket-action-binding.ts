import {
  addBracketMatchFromForm,
  addWalkInTeam,
  editBracketMatchFromForm,
  generateBracket,
  generatePlayoff,
  movePoolMatchFromForm,
  publishBracket,
  randomizeSeedFromForm,
  recordMatchResultFromForm,
  removeBracketMatch,
  reopenBracket,
  replaceEntryFromForm,
  resetBracket,
  resetMatch,
  seedBracketFromForm,
  seedBracketPlayoffFromForm,
  setBracketPoolsFromForm,
} from '../actions';
import {
  addBracketTeamFromClient,
  addBracketTeamsFromClient,
  addStandaloneMatchFromForm,
  editStandaloneMatchFromForm,
  generateStandaloneBracket,
  generateStandalonePlayoff,
  moveStandalonePoolMatchFromForm,
  publishStandaloneBracket,
  randomizeStandaloneSeedFromForm,
  recordStandaloneMatchResultFromForm,
  removeStandaloneBracketMatch,
  reopenStandaloneBracket,
  replaceStandaloneEntryFromForm,
  resetStandaloneBracket,
  resetStandaloneMatch,
  seedStandaloneFromForm,
  seedStandalonePlayoffFromForm,
  setStandalonePoolsFromForm,
} from '@/app/brackets/actions';
import type { BracketScope } from './labels';

type TeamMember = { displayName: string; email?: string };
type AddTeamResult =
  | { ok: true; id: string; name: string }
  | { ok: false; code: string; message: string };
type BulkAddTeamsResult =
  | { ok: true; added: Array<{ id: string; name: string }> }
  | { ok: false; code: string; message: string };

/**
 * The bracket-management server actions a reused view needs, already bound to
 * the active scope. Per-item args (pool, matchId) are bound by the caller; the
 * `*.bind(...)` happens on imported actions (event AND standalone are imported
 * here), so nothing crosses the RSC boundary as a non-action function — the
 * binding is RSC-safe regardless of which scope is active. See ADR 0025.
 */
export type BoundBracketActions = {
  generate: () => void | Promise<void>;
  generatePlayoff: () => void | Promise<void>;
  /** Re-seed the playoff from a host-chosen order (overrides the auto cross-seed). */
  seedPlayoffFromForm: (formData: FormData) => void | Promise<void>;
  reset: () => void | Promise<void>;
  /** Re-open a completed bracket so the host/owner can fix a result (TT-10). */
  reopen: () => void | Promise<void>;
  seedFromForm: (formData: FormData) => void | Promise<void>;
  randomizeSeedFromForm: (formData: FormData) => void | Promise<void>;
  movePoolMatch: (pool: string) => (formData: FormData) => void | Promise<void>;
  recordResult: (matchId: string) => (formData: FormData) => void | Promise<void>;
  resetMatch: (matchId: string) => () => void | Promise<void>;
  // ---- Draft + live structural edits (ADR 0032 / TT-11) ----
  /** Publish a draft bracket → live. */
  publish: () => void | Promise<void>;
  /** Reassign pools then rebuild the schedule (draft). */
  setPoolsFromForm: (formData: FormData) => void | Promise<void>;
  /** Append a match (draft / round-robin / pool play). */
  addMatchFromForm: (formData: FormData) => void | Promise<void>;
  /** Patch one match's matchup / court / length. */
  editMatchFromForm: (matchId: string) => (formData: FormData) => void | Promise<void>;
  /** Remove a match. */
  removeMatch: (matchId: string) => () => void | Promise<void>;
  /** Substitute one entry for another everywhere it appears. */
  replaceEntryFromForm: (formData: FormData) => void | Promise<void>;
  addTeam: (input: { name: string; members: ReadonlyArray<TeamMember> }) => Promise<AddTeamResult>;
  /**
   * Bulk "paste a list" add. Only wired for standalone brackets (typed-in
   * names, no roster); `undefined` for event scope, where walk-in teams carry
   * rosters and are added one at a time.
   */
  bulkAddTeams?: (names: ReadonlyArray<string>) => Promise<BulkAddTeamsResult>;
};

export function bindBracketActions(scope: BracketScope): BoundBracketActions {
  if (scope.kind === 'standalone') {
    const b = scope.bracketId;
    return {
      generate: generateStandaloneBracket.bind(null, b),
      generatePlayoff: generateStandalonePlayoff.bind(null, b),
      seedPlayoffFromForm: seedStandalonePlayoffFromForm.bind(null, b),
      reset: resetStandaloneBracket.bind(null, b),
      reopen: reopenStandaloneBracket.bind(null, b),
      seedFromForm: seedStandaloneFromForm.bind(null, b),
      randomizeSeedFromForm: randomizeStandaloneSeedFromForm.bind(null, b),
      movePoolMatch: (pool) => moveStandalonePoolMatchFromForm.bind(null, b, pool),
      recordResult: (matchId) => recordStandaloneMatchResultFromForm.bind(null, b, matchId),
      resetMatch: (matchId) => resetStandaloneMatch.bind(null, b, matchId),
      publish: publishStandaloneBracket.bind(null, b),
      setPoolsFromForm: setStandalonePoolsFromForm.bind(null, b),
      addMatchFromForm: addStandaloneMatchFromForm.bind(null, b),
      editMatchFromForm: (matchId) => editStandaloneMatchFromForm.bind(null, b, matchId),
      removeMatch: (matchId) => removeStandaloneBracketMatch.bind(null, b, matchId),
      replaceEntryFromForm: replaceStandaloneEntryFromForm.bind(null, b),
      // Standalone teams are typed-in names only — members are dropped.
      addTeam: (input) => addBracketTeamFromClient(b, input.name),
      bulkAddTeams: (names) => addBracketTeamsFromClient(b, names),
    };
  }
  const { eventId: e, divisionId: d } = scope;
  return {
    generate: generateBracket.bind(null, e, d),
    generatePlayoff: generatePlayoff.bind(null, e, d),
    seedPlayoffFromForm: seedBracketPlayoffFromForm.bind(null, e, d),
    reset: resetBracket.bind(null, e, d),
    reopen: reopenBracket.bind(null, e, d),
    seedFromForm: seedBracketFromForm.bind(null, e, d),
    randomizeSeedFromForm: randomizeSeedFromForm.bind(null, e, d),
    movePoolMatch: (pool) => movePoolMatchFromForm.bind(null, e, d, pool),
    recordResult: (matchId) => recordMatchResultFromForm.bind(null, e, d, matchId),
    resetMatch: (matchId) => resetMatch.bind(null, e, d, matchId),
    publish: publishBracket.bind(null, e, d),
    setPoolsFromForm: setBracketPoolsFromForm.bind(null, e, d),
    addMatchFromForm: addBracketMatchFromForm.bind(null, e, d),
    editMatchFromForm: (matchId) => editBracketMatchFromForm.bind(null, e, d, matchId),
    removeMatch: (matchId) => removeBracketMatch.bind(null, e, d, matchId),
    replaceEntryFromForm: replaceEntryFromForm.bind(null, e, d),
    addTeam: (input) => addWalkInTeam(e, d, input),
  };
}

/** Build the default event scope from a component's `eventId`/`divisionId`
 *  props so event call sites stay unchanged when they don't pass `scope`. */
export function eventScope(eventId: string, divisionId: string): BracketScope {
  return { kind: 'event', eventId, divisionId };
}
