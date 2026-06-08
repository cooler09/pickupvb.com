/**
 * The code-defined catalog of system achievement badges — the single source of
 * truth for every system badge's identity (title / description / visual) **and**
 * its earn rule (`qualifies`). Keeping the threshold next to the copy is what
 * lets `badge-rules.ts` stay a one-liner and the rule stay unit-tested
 * (`badge-rules.test.ts`).
 *
 * Tone is deliberately athletic, not cartoonish (gamification design decision —
 * "balanced"): badges read like real sports honours so they sit comfortably next
 * to the Pro / Admin badges on a product that handles real money. Easter-egg and
 * host badges live outside this catalog (Phases 2–3).
 */
import type { EasterEggBadgeKey, SystemBadgeKey } from './badge-key.js';
import type { PlayerBadgeStats } from './player-badge-stats.js';

/** Visual token; the web layer maps each to an inline athletic SVG glyph. */
export type BadgeIcon =
  | 'whistle'
  | 'crown'
  | 'medal'
  | 'season'
  | 'compass'
  | 'flame'
  | 'loyalty'
  | 'sparkle'
  | 'volleyball';

export type BadgeCategory = 'accomplishment' | 'milestone' | 'secret';

/** Drives the metal/colour treatment of the badge pill, ascending in prestige. */
export type BadgeTier = 'bronze' | 'silver' | 'gold';

/** The display shape shared by every badge kind (system + easter egg). */
export interface BadgeDisplay {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly category: BadgeCategory;
  readonly tier: BadgeTier;
  readonly icon: BadgeIcon;
}

export interface BadgeDefinition extends BadgeDisplay {
  readonly key: SystemBadgeKey;
  /**
   * Pure earn predicate over a computed stats snapshot. This is the rule — there
   * is no second copy in SQL; the reconciler only aggregates the snapshot.
   */
  readonly qualifies: (stats: PlayerBadgeStats) => boolean;
}

/** A hidden easter-egg badge (Phase 3). Granted by a playful trigger, not stats. */
export interface EasterEggDefinition extends BadgeDisplay {
  readonly key: EasterEggBadgeKey;
}

/**
 * Ordered for display: accomplishments (rarer, brag-worthy) before participation
 * milestones. Order here is the order the trophy case renders earned badges in.
 */
export const SYSTEM_BADGES: readonly BadgeDefinition[] = [
  {
    key: 'champion',
    title: 'Champion',
    description: 'Won a tournament bracket.',
    category: 'accomplishment',
    tier: 'gold',
    icon: 'crown',
    qualifies: (s) => s.tournamentChampionships >= 1,
  },
  {
    key: 'podium',
    title: 'Podium',
    description: 'Finished top-3 in a tournament.',
    category: 'accomplishment',
    tier: 'silver',
    icon: 'medal',
    qualifies: (s) => s.tournamentPodiums >= 1,
  },
  {
    key: 'seasoned',
    title: 'Seasoned',
    description: 'Played a league season to the finish.',
    category: 'accomplishment',
    tier: 'silver',
    icon: 'season',
    qualifies: (s) => s.leaguesCompleted >= 1,
  },
  {
    key: 'first-host',
    title: 'First Whistle',
    description: 'Published your first event.',
    category: 'accomplishment',
    tier: 'bronze',
    icon: 'whistle',
    qualifies: (s) => s.publishedEventCount >= 1,
  },
  {
    key: 'all-rounder',
    title: 'All-Rounder',
    description: 'Played three or more different positions.',
    category: 'accomplishment',
    tier: 'bronze',
    icon: 'compass',
    qualifies: (s) => s.distinctPositionsPlayed >= 3,
  },
  {
    key: 'regular',
    title: 'Regular',
    description: 'Showed up to 10 events.',
    category: 'milestone',
    tier: 'bronze',
    icon: 'flame',
    qualifies: (s) => s.attendedEventCount >= 10,
  },
  {
    key: 'veteran',
    title: 'Veteran',
    description: 'Showed up to 50 events.',
    category: 'milestone',
    tier: 'gold',
    icon: 'flame',
    qualifies: (s) => s.attendedEventCount >= 50,
  },
  {
    key: 'loyal',
    title: 'Loyal',
    description: 'Played 5 events with the same host.',
    category: 'milestone',
    tier: 'silver',
    icon: 'loyalty',
    qualifies: (s) => s.maxEventsWithSingleHost >= 5,
  },
];

/**
 * Hidden easter-egg badges (Phase 3) — kept tasteful and few (the "balanced"
 * tone): not a framework, just one or two playful collectibles granted by a
 * trigger (e.g. the Konami code on the profile). They are *not* in
 * `SYSTEM_BADGES`, so `badgesForStats` never awards them; they're granted
 * explicitly via `grantEasterEggBadge` and render in the same trophy case.
 */
export const EASTER_EGG_BADGES: readonly EasterEggDefinition[] = [
  {
    key: 'konami',
    title: 'Secret Set',
    description: 'You found the hidden code. Respect.',
    category: 'secret',
    tier: 'gold',
    icon: 'sparkle',
  },
  {
    key: 'pepper',
    title: 'Pepper',
    description: 'You kept the ball alive on the logo. Nice warm-up.',
    category: 'secret',
    tier: 'silver',
    icon: 'volleyball',
  },
];

const BY_KEY: ReadonlyMap<string, BadgeDisplay> = new Map(
  [...SYSTEM_BADGES, ...EASTER_EGG_BADGES].map((b) => [b.key, b]),
);
const SYSTEM_KEYS: ReadonlySet<string> = new Set(SYSTEM_BADGES.map((b) => b.key));
const EASTER_EGG_KEYS: ReadonlySet<string> = new Set(EASTER_EGG_BADGES.map((b) => b.key));

/** Look up a badge's display definition by key (system or easter egg). */
export const getBadgeDefinition = (key: string): BadgeDisplay | undefined => BY_KEY.get(key);

/** Type guard: is this arbitrary string a known system badge key? */
export const isSystemBadgeKey = (key: string): key is SystemBadgeKey => SYSTEM_KEYS.has(key);

/** Type guard: is this arbitrary string a known easter-egg badge key? */
export const isEasterEggBadgeKey = (key: string): key is EasterEggBadgeKey =>
  EASTER_EGG_KEYS.has(key);
