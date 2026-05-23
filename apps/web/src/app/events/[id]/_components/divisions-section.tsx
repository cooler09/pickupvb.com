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
 * has ≥ 1 division (backfilled); the single-division case still renders as
 * one row so the badges and capacity/price/prize info are visible. Hosts get
 * CRUD via {@link HostDivisionsManager} rendered separately on the page.
 */
export function DivisionsSection({ divisions }: Props) {
  if (divisions.length === 0) return null;
  // Per ADR 0007: until per-division checkout lands, we only render the
  // per-division price for single-division events (where it matches what
  // the resolved event-level checkout actually charges). For multi-division
  // events we suppress the price so the UI doesn't advertise a number the
  // checkout doesn't honor; the event-level price summary in the hero is the
  // source of truth in the interim.
  const showPerDivisionPrice = divisions.length === 1;
  return (
    <section className="space-y-3">
      <h2 className="text-fg text-lg font-semibold">
        Divisions <span className="text-muted text-sm font-normal">({divisions.length})</span>
      </h2>
      <ul className="space-y-3">
        {divisions.map((d) => {
          const price = showPerDivisionPrice ? formatPrice(d.priceCents, d.priceUnit) : null;
          const tierLabel = d.tierLabel ?? SKILL_TIER_LABEL[d.skillTier] ?? d.skillTier;
          return (
            <li
              key={d.id}
              className="border-border-base bg-surface space-y-2 rounded-lg border p-4"
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
