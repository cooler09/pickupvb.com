/**
 * Volleyball domain enums.
 * Single source of truth — re-exported by @pickupvb/types and persisted as
 * Postgres enums in supabase/migrations.
 */

export const Surface = {
    Indoor: 'indoor',
    Grass: 'grass',
    Sand: 'sand',
} as const;
export type Surface = (typeof Surface)[keyof typeof Surface];

export const Format = {
    Sixes: 'sixes',
    Quads: 'quads',
    Triples: 'triples',
    Doubles: 'doubles',
} as const;
export type Format = (typeof Format)[keyof typeof Format];

export const Gender = {
    Mens: 'mens',
    Womens: 'womens',
    Coed: 'coed',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const SkillLevel = {
    Beginner: 'beginner',
    Intermediate: 'intermediate',
    Advanced: 'advanced',
    Competitive: 'competitive',
} as const;
export type SkillLevel = (typeof SkillLevel)[keyof typeof SkillLevel];

export const EventType = {
    OpenPlay: 'open_play',
    Tournament: 'tournament',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const Visibility = {
    /** Discoverable by anyone, anyone can sign up. */
    Public: 'public',
    /** Discoverable only via direct invite link. */
    InviteOnly: 'invite_only',
    /** Discoverable by friends of the host. */
    FriendsOfHost: 'friends_of_host',
    /** Discoverable by friends of any attending member. */
    FriendsOfAttendees: 'friends_of_attendees',
} as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const EventStatus = {
    Draft: 'draft',
    Published: 'published',
    Cancelled: 'cancelled',
    Completed: 'completed',
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];
