/**
 * Badge identity primitives.
 *
 * System badges are a **code-defined catalog** (see `badge-catalog.ts`) — their
 * keys are a closed string-literal union so the rules, the UI, and the analytics
 * mapper all share one exhaustive vocabulary. Host badges (ADR — Phase 2) and
 * easter eggs are user/system authored at runtime, so their keys are free-form
 * `string`s discriminated by `source`. The `user_badges.badge_key` column
 * therefore stores a plain string; only the system catalog narrows to
 * `SystemBadgeKey`.
 */

/** The closed set of code-defined system achievement badges. */
export type SystemBadgeKey =
  | 'first-host'
  | 'champion'
  | 'podium'
  | 'seasoned'
  | 'all-rounder'
  | 'regular'
  | 'veteran'
  | 'loyal';

/** Hidden "easter egg" badges (Phase 3) — granted by playful triggers, not stats. */
export type EasterEggBadgeKey = 'konami';

/**
 * Where a granted badge came from. Drives both display treatment and the
 * uniqueness rule (system / easter-egg are unique per `(user, key)`; host
 * grants are unique per `(event_badge, user)` — see Phase 2).
 */
export type BadgeSource = 'system' | 'host' | 'easter_egg';
