import { EASTER_EGG_BADGES, SYSTEM_BADGES } from '@pickupvb/domain';
import { AchievementBadge, HostBadgeTile } from './achievement-badge';

export interface ShelfBadge {
  badgeKey: string;
  awardedAt: Date | null;
  /** 'system' | 'host' | 'easter_egg'. Absent is treated as a system badge. */
  source?: string;
  /** Host-badge display fields (snapshotted at grant time). */
  label?: string | null;
  iconUrl?: string | null;
}

/**
 * The "trophy case" — a player's earned achievement badges. System catalog
 * badges render first (with faint locked teasers when `showLocked`), then any
 * host-authored event badges (Phase 2) the player collected.
 *
 * - **Owner profile:** `showLocked` so the collector sees the full system set.
 * - **Public player page:** earned-only; renders nothing when empty so an idle
 *   profile doesn't show a barren case.
 */
export function BadgeShelf({
  earned,
  showLocked = false,
  heading = 'Badges',
}: {
  earned: ShelfBadge[];
  showLocked?: boolean;
  heading?: string;
}) {
  const earnedMap = new Map(earned.map((b) => [b.badgeKey, b.awardedAt]));
  const hostEarned = earned.filter((b) => b.source === 'host');

  const earnedDefs = SYSTEM_BADGES.filter((d) => earnedMap.has(d.key));
  const eggEarnedDefs = EASTER_EGG_BADGES.filter((d) => earnedMap.has(d.key));
  const lockedDefs = showLocked ? SYSTEM_BADGES.filter((d) => !earnedMap.has(d.key)) : [];

  const totalEarned = earnedDefs.length + eggEarnedDefs.length + hostEarned.length;

  // Nothing earned and no teasers to show — don't render an empty case.
  if (totalEarned === 0 && lockedDefs.length === 0) return null;

  return (
    <section className="border-border-base bg-surface rounded-shape-sm border p-5 sm:p-6">
      <h2 className="text-fg text-lg font-semibold">
        {heading} <span className="text-muted text-sm font-normal">({totalEarned})</span>
      </h2>

      {totalEarned === 0 ? (
        <p className="text-muted mt-2 text-sm">
          No badges yet — show up, host, and compete to start your collection.
        </p>
      ) : null}

      {(earnedDefs.length > 0 || eggEarnedDefs.length > 0 || lockedDefs.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-5">
          {earnedDefs.map((d) => (
            <AchievementBadge
              key={d.key}
              badgeKey={d.key}
              earned
              awardedAt={earnedMap.get(d.key) ?? null}
            />
          ))}
          {eggEarnedDefs.map((d) => (
            <AchievementBadge
              key={d.key}
              badgeKey={d.key}
              earned
              awardedAt={earnedMap.get(d.key) ?? null}
            />
          ))}
          {lockedDefs.map((d) => (
            <AchievementBadge key={d.key} badgeKey={d.key} earned={false} />
          ))}
        </div>
      )}

      {hostEarned.length > 0 && (
        <>
          <h3 className="text-muted mt-6 text-xs font-semibold tracking-wide uppercase">
            Event badges
          </h3>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-5">
            {hostEarned.map((b) => (
              <HostBadgeTile
                key={b.badgeKey}
                label={b.label ?? 'Event badge'}
                iconUrl={b.iconUrl ?? null}
                awardedAt={b.awardedAt}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
