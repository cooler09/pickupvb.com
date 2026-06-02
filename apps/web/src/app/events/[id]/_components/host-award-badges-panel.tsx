import Image from 'next/image';
import { fieldInputClass } from '@/components/field-styles';
import { primaryButtonClass } from '@/components/primary-button';
import { awardEventBadge, unawardEventBadge } from '../award-badge-actions';

type HostGrantBadge = { id: string; label: string; iconUrl: string | null };
type Attendee = { userId: string; name: string };
type Grant = { badgeKey: string; userId: string };

/**
 * Host panel to manually award `host_grant` event badges to attendees
 * (gamification Phase 2 — the "MVP" case). Server component: plain
 * `<form action={...}>` submissions bound to the host actions. Renders nothing
 * when the event has no host_grant badges (auto/on_attend badges aren't awarded
 * here — they grant on attendance).
 */
export function HostAwardBadgesPanel({
  eventId,
  returnPath,
  badges,
  attendees,
  grants,
}: {
  eventId: string;
  returnPath: string;
  badges: HostGrantBadge[];
  attendees: Attendee[];
  grants: Grant[];
}) {
  if (badges.length === 0) return null;

  const nameOf = new Map(attendees.map((a) => [a.userId, a.name]));

  return (
    <section className="border-border-base rounded-shape-sm space-y-5 border p-4">
      <header className="space-y-1">
        <h2 className="text-fg text-lg font-semibold">Award badges</h2>
        <p className="text-muted text-sm">
          Hand a manual badge to specific players. It appears in their trophy case right away.
        </p>
      </header>

      {badges.map((badge) => {
        const awardedIds = new Set(
          grants.filter((g) => g.badgeKey === badge.id).map((g) => g.userId),
        );
        const awardable = attendees.filter((a) => !awardedIds.has(a.userId));
        return (
          <div key={badge.id} className="border-border-base space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
                {badge.iconUrl ? (
                  <Image
                    src={badge.iconUrl}
                    alt=""
                    width={36}
                    height={36}
                    unoptimized
                    aria-hidden
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span aria-hidden className="text-sm font-bold">
                    ★
                  </span>
                )}
              </span>
              <span className="text-fg font-medium">{badge.label}</span>
            </div>

            {awardedIds.size > 0 && (
              <ul className="flex flex-wrap gap-2">
                {[...awardedIds].map((uid) => (
                  <li
                    key={uid}
                    className="bg-fg/5 flex items-center gap-1.5 rounded-full py-1 pr-1 pl-3 text-sm"
                  >
                    <span className="text-fg/80">{nameOf.get(uid) ?? 'Player'}</span>
                    <form action={unawardEventBadge.bind(null, eventId, badge.id, uid, returnPath)}>
                      <button
                        type="submit"
                        aria-label={`Remove ${badge.label} from ${nameOf.get(uid) ?? 'this player'}`}
                        className="text-muted hover:text-fg hover:bg-fg/10 tap-target flex h-6 w-6 items-center justify-center rounded-full text-base leading-none"
                      >
                        ×
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {awardable.length > 0 ? (
              <form
                action={awardEventBadge.bind(null, eventId, badge.id, returnPath)}
                className="flex flex-wrap items-end gap-2"
              >
                <label className="sr-only" htmlFor={`award-${badge.id}`}>
                  Attendee to award {badge.label}
                </label>
                <select
                  id={`award-${badge.id}`}
                  name="user_id"
                  required
                  className={`${fieldInputClass} max-w-xs`}
                >
                  <option value="">Choose an attendee…</option>
                  {awardable.map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className={primaryButtonClass('sm')}>
                  Award
                </button>
              </form>
            ) : (
              <p className="text-muted text-xs">
                {attendees.length === 0
                  ? 'No attendees to award yet.'
                  : 'Every attendee already has this badge.'}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
