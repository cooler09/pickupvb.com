import type { TeamId } from '../events/volleyball-event.js';
import type { Match, MatchId, Seed } from './match.js';

/**
 * Pure generator helpers for bracket layouts.
 *
 * Each generator returns a `Match[]` with all wiring (`advancesToMatchId`)
 * resolved. IDs are produced by the supplied `mkId` factory so the caller
 * (typically the repository when persisting a freshly generated bracket)
 * controls ID assignment.
 *
 * v1 supports single elimination and round robin. Pool play, double elim,
 * and Swiss are scaffolded with TODO stubs and validated at the aggregate
 * boundary so the UI can surface "format not implemented yet".
 */

type IdFactory = () => MatchId;

/** Seeds in the canonical bracket-position order for a P-slot single-elim bracket. */
function bracketSlots(p: number): number[] {
    if (p < 2 || (p & (p - 1)) !== 0) {
        throw new Error(`bracketSlots requires power-of-two p, got ${p}`);
    }
    if (p === 2) return [1, 2];
    const half = bracketSlots(p / 2);
    const out: number[] = [];
    for (const s of half) out.push(s, p + 1 - s);
    return out;
}

/** Smallest power of two >= n. */
function nextPow2(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

/**
 * Generate a single-elimination bracket. Byes go to the top seeds
 * automatically (highest seeds are paired against phantom slots).
 */
export function generateSingleElimination(
    seeds: ReadonlyArray<Seed>,
    mkId: IdFactory,
): Match[] {
    if (seeds.length < 2) {
        throw new Error('Single elimination requires at least 2 teams.');
    }
    const sorted = [...seeds].sort((a, b) => a.seed - b.seed);
    const N = sorted.length;
    const P = nextPow2(N);
    const slots = bracketSlots(P);

    // teamForSlot[slotIdx] = team at canonical slot position (1-indexed)
    const teamForSlot = new Map<number, TeamId>();
    for (const s of sorted) teamForSlot.set(s.seed, s.teamId);

    const totalRounds = Math.log2(P);
    const matches: Match[] = [];
    // Build rounds bottom-up so we know the IDs of round R+1 before round R.
    // We'll record for each "half-pair" of round R, the match it feeds in R+1.
    const matchesByRound: Match[][] = [];

    for (let round = totalRounds; round >= 1; round--) {
        const matchesInRound = Math.pow(2, totalRounds - round);
        const arr: Match[] = [];
        for (let m = 0; m < matchesInRound; m++) {
            const nextRoundArr = matchesByRound[totalRounds - round - 1];
            const feedsIdx = Math.floor(m / 2);
            const feeds = nextRoundArr ? nextRoundArr[feedsIdx] : null;
            const slot: 'a' | 'b' = m % 2 === 0 ? 'a' : 'b';
            arr.push({
                id: mkId(),
                round,
                matchNumber: m + 1,
                pool: null,
                bracketSide: null,
                teamAId: null,
                teamBId: null,
                winnerTeamId: null,
                status: 'pending',
                sets: [],
                advancesToMatchId: feeds ? feeds.id : null,
                advancesToSlot: feeds ? slot : null,
                loserAdvancesToMatchId: null,
                loserAdvancesToSlot: null,
                scheduledAt: null,
            });
        }
        matchesByRound[totalRounds - round] = arr;
    }

    // Round 1 team placement + bye auto-advance.
    const round1 = matchesByRound[totalRounds - 1];
    if (!round1) throw new Error('round-1 should exist');
    for (let i = 0; i < round1.length; i++) {
        const slotA = slots[i * 2];
        const slotB = slots[i * 2 + 1];
        if (slotA === undefined || slotB === undefined) continue;
        const teamA = teamForSlot.get(slotA) ?? null;
        const teamB = teamForSlot.get(slotB) ?? null;
        const m = round1[i];
        if (!m) continue;
        m.teamAId = teamA;
        m.teamBId = teamB;
        if (teamA && !teamB) {
            m.status = 'bye';
            m.winnerTeamId = teamA;
            placeAdvancedTeam(matchesByRound, m, teamA);
        } else if (teamB && !teamA) {
            m.status = 'bye';
            m.winnerTeamId = teamB;
            placeAdvancedTeam(matchesByRound, m, teamB);
        } else if (!teamA && !teamB) {
            // Phantom-vs-phantom: should not happen with sensible seeding.
            m.status = 'bye';
        }
    }

    for (const r of matchesByRound) matches.push(...r);
    return matches;
}

function placeAdvancedTeam(
    matchesByRound: Match[][],
    fromMatch: Match,
    teamId: TeamId,
): void {
    if (!fromMatch.advancesToMatchId || !fromMatch.advancesToSlot) return;
    const next = findMatch(matchesByRound, fromMatch.advancesToMatchId);
    if (!next) return;
    if (fromMatch.advancesToSlot === 'a') next.teamAId = teamId;
    else next.teamBId = teamId;
}

function findMatch(matchesByRound: Match[][], id: MatchId): Match | null {
    for (const r of matchesByRound) {
        for (const m of r) if (m.id === id) return m;
    }
    return null;
}

/**
 * Generate a round-robin schedule using the standard circle method.
 * Every team plays every other team exactly once. For odd N, one team
 * sits out per round.
 */
export function generateRoundRobin(
    seeds: ReadonlyArray<Seed>,
    mkId: IdFactory,
): Match[] {
    if (seeds.length < 2) {
        throw new Error('Round robin requires at least 2 teams.');
    }
    const sorted = [...seeds].sort((a, b) => a.seed - b.seed);
    const teams: (TeamId | null)[] = sorted.map((s) => s.teamId);
    if (teams.length % 2 === 1) teams.push(null); // bye marker

    const n = teams.length;
    const rounds = n - 1;
    const half = n / 2;
    const matches: Match[] = [];

    // Fix team 0; rotate the rest.
    let rotation: (TeamId | null)[] = teams.slice(1);
    const fixed = teams[0] ?? null;
    for (let round = 1; round <= rounds; round++) {
        const arrangement: (TeamId | null)[] = [fixed, ...rotation];
        let matchNum = 1;
        for (let i = 0; i < half; i++) {
            const a = arrangement[i] ?? null;
            const b = arrangement[n - 1 - i] ?? null;
            // Skip the bye pairing entirely.
            if (a === null || b === null) continue;
            matches.push({
                id: mkId(),
                round,
                matchNumber: matchNum++,
                pool: null,
                bracketSide: null,
                teamAId: a,
                teamBId: b,
                winnerTeamId: null,
                status: 'pending',
                sets: [],
                advancesToMatchId: null,
                advancesToSlot: null,
                loserAdvancesToMatchId: null,
                loserAdvancesToSlot: null,
                scheduledAt: null,
            });
        }
        // Rotate.
        const last = rotation[rotation.length - 1];
        if (last !== undefined) {
            rotation = [last, ...rotation.slice(0, -1)];
        }
    }
    return matches;
}

/** Stub for formats not yet implemented. */
export function generateNotImplemented(format: string): never {
    throw new Error(
        `Bracket format "${format}" is not implemented yet. ` +
        `v1 supports single_elimination and round_robin.`,
    );
}
