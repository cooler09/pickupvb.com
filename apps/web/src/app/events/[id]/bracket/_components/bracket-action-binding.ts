import {
  addWalkInTeam,
  generateBracket,
  generatePlayoff,
  movePoolMatchFromForm,
  randomizeSeedFromForm,
  recordMatchResultFromForm,
  resetBracket,
  resetMatch,
  seedBracketFromForm,
} from '../actions';
import {
  addBracketTeamFromClient,
  addBracketTeamsFromClient,
  generateStandaloneBracket,
  generateStandalonePlayoff,
  moveStandalonePoolMatchFromForm,
  randomizeStandaloneSeedFromForm,
  recordStandaloneMatchResultFromForm,
  resetStandaloneBracket,
  resetStandaloneMatch,
  seedStandaloneFromForm,
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
  reset: () => void | Promise<void>;
  seedFromForm: (formData: FormData) => void | Promise<void>;
  randomizeSeedFromForm: (formData: FormData) => void | Promise<void>;
  movePoolMatch: (pool: string) => (formData: FormData) => void | Promise<void>;
  recordResult: (matchId: string) => (formData: FormData) => void | Promise<void>;
  resetMatch: (matchId: string) => () => void | Promise<void>;
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
      reset: resetStandaloneBracket.bind(null, b),
      seedFromForm: seedStandaloneFromForm.bind(null, b),
      randomizeSeedFromForm: randomizeStandaloneSeedFromForm.bind(null, b),
      movePoolMatch: (pool) => moveStandalonePoolMatchFromForm.bind(null, b, pool),
      recordResult: (matchId) => recordStandaloneMatchResultFromForm.bind(null, b, matchId),
      resetMatch: (matchId) => resetStandaloneMatch.bind(null, b, matchId),
      // Standalone teams are typed-in names only — members are dropped.
      addTeam: (input) => addBracketTeamFromClient(b, input.name),
      bulkAddTeams: (names) => addBracketTeamsFromClient(b, names),
    };
  }
  const { eventId: e, divisionId: d } = scope;
  return {
    generate: generateBracket.bind(null, e, d),
    generatePlayoff: generatePlayoff.bind(null, e, d),
    reset: resetBracket.bind(null, e, d),
    seedFromForm: seedBracketFromForm.bind(null, e, d),
    randomizeSeedFromForm: randomizeSeedFromForm.bind(null, e, d),
    movePoolMatch: (pool) => movePoolMatchFromForm.bind(null, e, d, pool),
    recordResult: (matchId) => recordMatchResultFromForm.bind(null, e, d, matchId),
    resetMatch: (matchId) => resetMatch.bind(null, e, d, matchId),
    addTeam: (input) => addWalkInTeam(e, d, input),
  };
}

/** Build the default event scope from a component's `eventId`/`divisionId`
 *  props so event call sites stay unchanged when they don't pass `scope`. */
export function eventScope(eventId: string, divisionId: string): BracketScope {
  return { kind: 'event', eventId, divisionId };
}
