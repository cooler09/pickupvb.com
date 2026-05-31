import type { DivisionLite } from '@pickupvb/domain';
import {
  SURFACE_LABEL,
  FORMAT_LABEL,
  GENDER_LABEL,
  SKILL_TIER_LABEL,
  AGE_GROUP_LABEL,
  TEAM_COMPOSITION_LABEL,
  PRICE_UNIT_LABEL,
} from '@/lib/enum-labels';

type Props = {
  divisions: ReadonlyArray<DivisionLite>;
};

function formatPrice(cents: number | null, unit: string): string | null {
  if (cents === null) return null;
  if (cents === 0) return 'Free';
  const usd = (cents / 100).toFixed(2);
  return `$${usd} ${PRICE_UNIT_LABEL[unit] ?? ''}`.trim();
}

function formatCapacity(kind: 'fixed' | 'unlimited' | null, maxSpots: number | null): string {
  if (kind === 'fixed' && maxSpots !== null) return `${maxSpots} spots`;
  if (kind === 'unlimited') return 'Unlimited';
  return '—';
}

/**
 * Read-only display of all divisions on an event. Per ADR 0006 every event
 * has ≥ 1 division (backfilled). For single-division events the surrounding
 * `EventHero` + meta sections already render skill tier, format, gender,
 * capacity, and price for `divisions[0]`, so this section would just
 * duplicate that data — we render only when there are 2+ divisions worth
 * comparing. Hosts get CRUD via {@link HostDivisionsManager} rendered
 * separately on the page (always visible so a host can split a
 * single-division event).
 */
export function DivisionsSection({ divisions }: Props) {
  if (divisions.length <= 1) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-fg text-lg font-semibold">
        Divisions <span className="text-muted text-sm font-normal">({divisions.length})</span>
      </h2>
      <ul className="space-y-3">
        {divisions.map((d) => {
          const price = formatPrice(d.priceCents, d.priceUnit);
          const tierLabel = d.tierLabel ?? SKILL_TIER_LABEL[d.skillTier] ?? d.skillTier;
          return (
            <li
              key={d.id}
              className="border-border-base bg-surface rounded-shape-sm space-y-2 border p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-fg text-base font-semibold">{d.label}</h3>
                <span className="text-muted text-xs">
                  {formatCapacity(d.capacityKind, d.maxSpots)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 font-medium">
                  {tierLabel}
                </span>
                <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-0.5">
                  {SURFACE_LABEL[d.surface] ?? d.surface}
                </span>
                <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-0.5">
                  {FORMAT_LABEL[d.format] ?? d.format}
                </span>
                <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-0.5">
                  {GENDER_LABEL[d.gender] ?? d.gender}
                </span>
                {d.ageGroup !== 'adult' && (
                  <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-0.5">
                    {AGE_GROUP_LABEL[d.ageGroup] ?? d.ageGroup}
                  </span>
                )}
                <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-0.5">
                  {TEAM_COMPOSITION_LABEL[d.teamComposition] ?? d.teamComposition}
                </span>
              </div>
              {(price || d.prizeText) && (
                <dl className="text-muted grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  {price && (
                    <div>
                      <dt className="text-fg/70 inline font-medium">Price: </dt>
                      <dd className="inline">{price}</dd>
                    </div>
                  )}
                  {d.prizeText && (
                    <div>
                      <dt className="text-fg/70 inline font-medium">Prize: </dt>
                      <dd className="inline">{d.prizeText}</dd>
                    </div>
                  )}
                </dl>
              )}
              {d.winner && (
                <p className="text-primary text-sm font-medium">
                  Winner: <span className="text-fg">{d.winner.label}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
