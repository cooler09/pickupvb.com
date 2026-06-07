import Link from 'next/link';
import type { Route } from 'next';

export type Timeframe = 'upcoming' | 'past' | 'following';

type Props = {
  when: Timeframe;
  /** Hide the "Following" tab when there's no signed-in user. */
  showFollowing: boolean;
  /** Number of accounts the viewer follows; renders as a small badge. */
  followingCount: number;
  /** Builds the href for switching to the given tab while preserving filters. */
  hrefFor: (target: Timeframe) => Route;
};

const TAB_BASE = 'rounded px-3 py-1.5 font-medium transition';
const TAB_ACTIVE = 'bg-primary text-primary-fg';
const TAB_IDLE = 'text-fg/70 hover:bg-fg/5';

/**
 * Tab strip for switching between Upcoming / Following / Past timeframes on
 * the events list. Filter state is preserved across tab clicks via the
 * caller-provided `hrefFor` builder.
 */
/** `aria-current="page"` only when active — spread to satisfy exactOptionalPropertyTypes. */
const current = (active: boolean) => (active ? ({ 'aria-current': 'page' } as const) : {});

export function EventTimeframeTabs({ when, showFollowing, followingCount, hrefFor }: Props) {
  // These switch the whole page URL, so they are navigation links, not WAI-ARIA
  // tabs (no roving focus / tabpanel). `<nav>` + `aria-current="page"` is the
  // correct affordance; the segmented look is purely visual (B2).
  return (
    <nav
      aria-label="Event timeframe"
      className="border-border-base bg-md-surface-container inline-flex rounded-md border p-0.5 text-sm"
    >
      <Link
        href={hrefFor('upcoming')}
        {...current(when === 'upcoming')}
        className={`${TAB_BASE} ${when === 'upcoming' ? TAB_ACTIVE : TAB_IDLE}`}
      >
        Upcoming
      </Link>
      {showFollowing && (
        <Link
          href={hrefFor('following')}
          {...current(when === 'following')}
          className={`${TAB_BASE} ${when === 'following' ? TAB_ACTIVE : TAB_IDLE}`}
        >
          Following
          {followingCount > 0 && (
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                when === 'following'
                  ? 'bg-primary-fg/20 text-primary-fg'
                  : 'bg-primary/15 text-primary'
              }`}
            >
              {followingCount}
            </span>
          )}
        </Link>
      )}
      <Link
        href={hrefFor('past')}
        {...current(when === 'past')}
        className={`${TAB_BASE} ${when === 'past' ? TAB_ACTIVE : TAB_IDLE}`}
      >
        Past
      </Link>
    </nav>
  );
}
