import type { EventId } from '../events/volleyball-event.js';
import type { Bracket } from './bracket.js';
import type { BracketId, MatchId } from './match.js';

/**
 * Read model returned to the bracket UI: enriched with team display info
 * the domain doesn't carry (names, captain ids for permission checks).
 */
export interface BracketTeamLite {
    readonly teamId: string;
    readonly name: string;
    readonly captainId: string;
}

export interface BracketReadModel {
    readonly bracket: Bracket;
    readonly teams: ReadonlyArray<BracketTeamLite>;
}

export interface BracketRepository {
    /** Generate a new domain MatchId. Used by the aggregate's `generate()`. */
    nextMatchId(): MatchId;
    /** Generate a new domain BracketId for `Bracket.create`. */
    nextBracketId(): BracketId;

    findByEventId(eventId: EventId): Promise<Bracket | null>;
    findById(id: BracketId): Promise<Bracket | null>;
    save(bracket: Bracket): Promise<void>;
    /** Used by the read-model loader to enrich match cards with team labels. */
    listRegisteredTeams(eventId: EventId): Promise<BracketTeamLite[]>;
}
