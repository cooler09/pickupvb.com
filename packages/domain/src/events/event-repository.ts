import type { VolleyballEvent } from './volleyball-event.js';
import type { Surface, Format, Gender, SkillLevel, EventType, Visibility } from './enums.js';

/**
 * Repository contract (DDD port).
 * Adapter lives in the API layer (e.g. SupabaseEventRepository).
 */
export interface EventRepository {
    findById(id: string): Promise<VolleyballEvent | null>;
    save(event: VolleyballEvent): Promise<void>;
    search(query: EventSearchQuery): Promise<VolleyballEventSummary[]>;
}

export interface EventSearchQuery {
    /** Center point for radius search ("near me"). */
    near?: { latitude: number; longitude: number; radiusKm: number };
    surface?: Surface;
    format?: Format;
    gender?: Gender;
    skillLevel?: SkillLevel;
    type?: EventType;
    visibility?: Visibility;
    startsAfter?: Date;
    startsBefore?: Date;
    /** Caller's user id, used to enforce visibility (friend graph, invites). */
    viewerId?: string;
    limit?: number;
    cursor?: string;
}

export interface VolleyballEventSummary {
    id: string;
    title: string;
    surface: Surface;
    format: Format;
    gender: Gender;
    skillLevel: SkillLevel;
    type: EventType;
    startsAt: Date;
    city: string;
    region: string;
    spotsRemaining: number | null;
    distanceKm: number | null;
}
