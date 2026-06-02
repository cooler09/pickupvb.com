import Image from 'next/image';
import { getBadgeDefinition, type BadgeTier } from '@pickupvb/domain';
import { BadgeGlyph } from './badge-icon';

/**
 * A single achievement badge tile for the trophy case. Athletic, not cartoonish
 * (gamification "balanced" tone): an icon disc with a tier-coloured ring, sitting
 * comfortably next to the Pro / Admin pills. Earned badges glow in their metal;
 * unearned ("locked") badges render as a muted, desaturated teaser so the
 * collector can see what's left to chase. Presentational + server-safe.
 */

const tierDisc: Record<BadgeTier, string> = {
  gold: 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 ring-amber-400/60',
  silver: 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 ring-slate-300/70',
  bronze: 'bg-gradient-to-br from-orange-300 to-amber-700 text-amber-50 ring-orange-500/50',
};

export function AchievementBadge({
  badgeKey,
  earned,
  awardedAt,
}: {
  badgeKey: string;
  earned: boolean;
  awardedAt?: Date | null;
}) {
  const def = getBadgeDefinition(badgeKey);
  if (!def) return null;

  const earnedLine =
    earned && awardedAt
      ? `Earned ${awardedAt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
      : earned
        ? 'Earned'
        : 'Locked';

  return (
    <div
      className="flex w-20 flex-col items-center gap-1.5 text-center"
      title={`${def.title} — ${def.description}${earned ? '' : ' (locked)'}`}
    >
      <span
        className={
          'flex h-14 w-14 items-center justify-center rounded-full ring-2 ' +
          (earned
            ? tierDisc[def.tier] + ' shadow-sm'
            : 'bg-fg/5 text-fg/30 ring-border-base grayscale')
        }
      >
        <BadgeGlyph icon={def.icon} className="h-7 w-7" />
      </span>
      <span className={'text-xs font-semibold ' + (earned ? 'text-fg' : 'text-fg/40')}>
        {def.title}
      </span>
      <span className="text-muted text-[10px] leading-tight">{earnedLine}</span>
    </div>
  );
}

/**
 * A host-authored event badge tile (gamification Phase 2). Unlike system badges
 * these carry custom art, so the disc shows the host's uploaded icon (falling
 * back to a neutral glyph) rather than a catalog glyph. Always "earned" — host
 * badges only appear once granted. Presentational + server-safe.
 */
export function HostBadgeTile({
  label,
  iconUrl,
  awardedAt,
}: {
  label: string;
  iconUrl?: string | null;
  awardedAt?: Date | null;
}) {
  const earnedLine = awardedAt
    ? `Earned ${awardedAt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
    : 'Earned';
  return (
    <div className="flex w-20 flex-col items-center gap-1.5 text-center" title={label}>
      <span className="ring-primary/40 bg-primary/10 text-primary flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-sm ring-2">
        {iconUrl ? (
          <Image
            src={iconUrl}
            alt=""
            width={56}
            height={56}
            unoptimized
            aria-hidden
            className="h-full w-full object-cover"
          />
        ) : (
          <BadgeGlyph icon="medal" className="h-7 w-7" />
        )}
      </span>
      <span className="text-fg line-clamp-2 text-xs font-semibold">{label}</span>
      <span className="text-muted text-[10px] leading-tight">{earnedLine}</span>
    </div>
  );
}
