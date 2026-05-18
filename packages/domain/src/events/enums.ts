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

/**
 * Real-world division ladder used by outdoor / NAGVA / club tournaments.
 * The legacy {@link SkillLevel} enum remains on the event row for back-compat;
 * new code should prefer `SkillTier` on the division.
 *
 * Stored as the Postgres enum `skill_tier` (see
 * supabase/migrations/20260605000100_event_divisions.sql).
 */
export const SkillTier = {
  C: 'c',
  B: 'b',
  BB: 'bb',
  BB3: 'bb3',
  A: 'a',
  AA: 'aa',
  Open: 'open',
} as const;
export type SkillTier = (typeof SkillTier)[keyof typeof SkillTier];

/**
 * Coarse band used by search filters. Badges always render the precise
 * {@link SkillTier} label; the band lets us collapse the ladder into the
 * four buckets users actually filter by.
 */
export const SkillBand = {
  Beginner: 'beginner',
  Intermediate: 'intermediate',
  Advanced: 'advanced',
  Competitive: 'competitive',
} as const;
export type SkillBand = (typeof SkillBand)[keyof typeof SkillBand];

export function skillTierBand(tier: SkillTier): SkillBand {
  switch (tier) {
    case SkillTier.C:
    case SkillTier.B:
      return SkillBand.Beginner;
    case SkillTier.BB:
    case SkillTier.BB3:
      return SkillBand.Intermediate;
    case SkillTier.A:
      return SkillBand.Advanced;
    case SkillTier.AA:
    case SkillTier.Open:
      return SkillBand.Competitive;
  }
}

/**
 * Maps the legacy single-field {@link SkillLevel} to a {@link SkillTier} for
 * backfill and read-shim compatibility. Mirrors the SQL backfill in
 * 20260605000100_event_divisions.sql.
 */
export function skillTierFromLegacy(level: SkillLevel): SkillTier {
  switch (level) {
    case SkillLevel.Beginner:
      return SkillTier.B;
    case SkillLevel.Intermediate:
      return SkillTier.BB;
    case SkillLevel.Advanced:
      return SkillTier.A;
    case SkillLevel.Competitive:
      return SkillTier.Open;
  }
}

/** Age grouping for a division. `Adult` is the default for non-youth play. */
export const AgeGroup = {
  Adult: 'adult',
  HighSchool: 'hs',
  U18: '18u',
  U16: '16u',
  U14: '14u',
  JuniorHigh: 'jr_high',
} as const;
export type AgeGroup = (typeof AgeGroup)[keyof typeof AgeGroup];

/**
 * How players sign up for a division.
 *   - `Solo`             individuals (open-play style)
 *   - `Team`             full pre-formed team registers
 *   - `PairDraw`         sign up as a pair/triple; drawn with another into the playing team
 *   - `PartnerRequired`  fixed N-person team built at signup time
 */
export const TeamComposition = {
  Solo: 'solo',
  Team: 'team',
  PairDraw: 'pair_draw',
  PartnerRequired: 'partner_required',
} as const;
export type TeamComposition = (typeof TeamComposition)[keyof typeof TeamComposition];

/** Whether a division's price is charged per individual player or per team. */
export const PriceUnit = {
  PerPlayer: 'per_player',
  PerTeam: 'per_team',
} as const;
export type PriceUnit = (typeof PriceUnit)[keyof typeof PriceUnit];

/**
 * Where signup happens. `External` events suppress on-platform RSVP / team /
 * free-agent / checkout panels and surface a "How to register" card built
 * from {@link VolleyballEvent.externalRegistration}.
 */
export const RegistrationMode = {
  Platform: 'platform',
  External: 'external',
} as const;
export type RegistrationMode = (typeof RegistrationMode)[keyof typeof RegistrationMode];

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

/**
 * Volleyball positions used when an open-play host enables positional sign-up.
 * Values match `profiles.{primary,secondary,tertiary}_position` (see
 * supabase/migrations/20260514000300_profile_positions.sql) and the
 * `event_attendees.position` check constraint.
 */
export const EventPosition = {
  Setter: 'setter',
  Outside: 'outside',
  Opposite: 'opposite',
  Middle: 'middle',
  Libero: 'libero',
  DefensiveSpecialist: 'defensive_specialist',
} as const;
export type EventPosition = (typeof EventPosition)[keyof typeof EventPosition];

export const EVENT_POSITIONS: ReadonlyArray<EventPosition> = [
  EventPosition.Setter,
  EventPosition.Outside,
  EventPosition.Opposite,
  EventPosition.Middle,
  EventPosition.Libero,
  EventPosition.DefensiveSpecialist,
];

export function isEventPosition(v: unknown): v is EventPosition {
  return typeof v === 'string' && (EVENT_POSITIONS as ReadonlyArray<string>).includes(v);
}
