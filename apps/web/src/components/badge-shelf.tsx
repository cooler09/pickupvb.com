import type { ReactNode } from 'react';
import { EASTER_EGG_BADGES, SYSTEM_BADGES } from '@pickupvb/domain';
import { AchievementBadge, HostBadgeTile } from './achievement-badge';
import { setBadgeHidden } from '@/app/profile/badge-visibility-actions';

export interface ShelfBadge {
  badgeKey: string;
  awardedAt: Date | null;
  /** 'system' | 'host' | 'easter_egg'. Absent is treated as a system badge. */
  source?: string;
  /** Owner opted this badge out of public display (owner shelf only). */
  hidden?: boolean;
  /** Host-badge display fields (snapshotted at grant time). */
  label?: string | null;
  iconUrl?: string | null;
}

/**
 * Per-tile "Hide / Show" control for the owner trophy case (badges audit BA-2).
 * Server-rendered plain `<form>` bound to the visibility action — no client
 * boundary. Only rendered when `manageHidden` + a `returnPath` are supplied
 * (i.e. the owner viewing their own profile); the public player page never
 * shows it and never sees hidden badges (the `user_badges_public` view filters
 * them server-side).
 */
function ManageableTile({
  children,
  hidden,
  manage,
}: {
  children: ReactNode;
  hidden: boolean;
  manage?: { badgeKey: string; label: string; returnPath: string };
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={hidden ? 'opacity-40' : undefined}>{children}</div>
      {manage && (
        <form action={setBadgeHidden.bind(null, manage.badgeKey, !hidden, manage.returnPath)}>
          <button
            type="submit"
            className="text-muted hover:text-fg tap-target text-[10px] underline underline-offset-2"
            aria-label={
              hidden
                ? `Show ${manage.label} on your public profile`
                : `Hide ${manage.label} from your public profile`
            }
          >
            {hidden ? 'Show' : 'Hide'}
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * The "trophy case" — a player's earned achievement badges. System catalog
 * badges render first (with faint locked teasers when `showLocked`), then any
 * host-authored event badges (Phase 2) the player collected.
 *
 * - **Owner profile:** `showLocked` so the collector sees the full system set,
 *   and `manageHidden` + `returnPath` to expose the per-badge Hide/Show toggle.
 *   Hidden badges still render (dimmed) so the owner can find and un-hide them.
 * - **Public player page:** earned-only; renders nothing when empty so an idle
 *   profile doesn't show a barren case. Hidden badges never reach it.
 */
export function BadgeShelf({
  earned,
  showLocked = false,
  manageHidden = false,
  returnPath,
  heading = 'Badges',
}: {
  earned: ShelfBadge[];
  showLocked?: boolean;
  manageHidden?: boolean;
  returnPath?: string;
  heading?: string;
}) {
  const earnedMap = new Map(earned.map((b) => [b.badgeKey, b.awardedAt]));
  const hiddenMap = new Map(earned.map((b) => [b.badgeKey, b.hidden ?? false]));
  const hostEarned = earned.filter((b) => b.source === 'host');

  const earnedDefs = SYSTEM_BADGES.filter((d) => earnedMap.has(d.key));
  const eggEarnedDefs = EASTER_EGG_BADGES.filter((d) => earnedMap.has(d.key));
  const lockedDefs = showLocked ? SYSTEM_BADGES.filter((d) => !earnedMap.has(d.key)) : [];

  const totalEarned = earnedDefs.length + eggEarnedDefs.length + hostEarned.length;

  // Nothing earned and no teasers to show — don't render an empty case.
  if (totalEarned === 0 && lockedDefs.length === 0) return null;

  // The per-tile Hide/Show control is wired only on the owner shelf. Inlining the
  // `returnPath != null` guard narrows it to a string inside the true branch
  // (a separate `const` wouldn't), so `manage` stays spread-or-omitted under
  // exactOptionalPropertyTypes.
  const manageFor = (badgeKey: string, label: string) =>
    manageHidden && returnPath != null ? { manage: { badgeKey, label, returnPath } } : {};

  return (
    <section className="border-border-base bg-md-surface-container rounded-shape-sm border p-5 sm:p-6">
      <h2 className="text-fg text-lg font-semibold">
        {heading} <span className="text-muted text-sm font-normal">({totalEarned})</span>
      </h2>

      {totalEarned === 0 ? (
        <p className="text-muted mt-2 text-sm">
          No badges yet — show up, host, and compete to start your collection.
        </p>
      ) : null}

      {(earnedDefs.length > 0 || eggEarnedDefs.length > 0 || lockedDefs.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-4">
          {earnedDefs.map((d) => (
            <ManageableTile
              key={d.key}
              hidden={hiddenMap.get(d.key) ?? false}
              {...manageFor(d.key, d.title)}
            >
              <AchievementBadge badgeKey={d.key} earned awardedAt={earnedMap.get(d.key) ?? null} />
            </ManageableTile>
          ))}
          {eggEarnedDefs.map((d) => (
            <ManageableTile
              key={d.key}
              hidden={hiddenMap.get(d.key) ?? false}
              {...manageFor(d.key, d.title)}
            >
              <AchievementBadge badgeKey={d.key} earned awardedAt={earnedMap.get(d.key) ?? null} />
            </ManageableTile>
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
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-4">
            {hostEarned.map((b) => (
              <ManageableTile
                key={b.badgeKey}
                hidden={b.hidden ?? false}
                {...manageFor(b.badgeKey, b.label ?? 'Event badge')}
              >
                <HostBadgeTile
                  label={b.label ?? 'Event badge'}
                  iconUrl={b.iconUrl ?? null}
                  awardedAt={b.awardedAt}
                />
              </ManageableTile>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
