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
  /**
   * Registered count per division id (roster teams + ad-hoc / walk-in
   * registrations), computed at the page boundary from the same data the
   * public roster uses. Divisions absent from the map render as 0.
   */
  teamCounts?: ReadonlyMap<string, number>;
  /**
   * True when registration (and/or payment) is off PickupVB. The on-platform
   * registered count is then empty/partial — same reason the public roster is
   * suppressed — so capacity labels drop the `registered /` prefix and show
   * the cap alone.
   */
  offPlatform?: boolean;
};

function formatPrice(cents: number | null, unit: string): string | null {
  if (cents === null) return null;
  if (cents === 0) return 'Free';
  const usd = (cents / 100).toFixed(2);
  return `$${usd} ${PRICE_UNIT_LABEL[unit] ?? ''}`.trim();
}

/**
 * Capacity label for one division. Team divisions (ADR 0016 —
 * `teamRegistrationMode` set) are measured in teams, so we show
 * `registered / cap teams` (or `N teams` when uncapped). Individual-signup
 * divisions keep the spots wording.
 */
function formatCapacity(d: DivisionLite, registeredTeams: number, offPlatform: boolean): string {
  if (d.teamRegistrationMode !== null) {
    if (d.capacityKind === 'fixed' && d.maxSpots !== null) {
      // Off-platform: the registered count is empty/partial, so show the cap
      // alone rather than a misleading `0 / N teams`.
      return offPlatform ? `${d.maxSpots} teams` : `${registeredTeams} / ${d.maxSpots} teams`;
    }
    if (offPlatform) return 'Unlimited';
    return `${registeredTeams} ${registeredTeams === 1 ? 'team' : 'teams'}`;
  }
  if (d.capacityKind === 'fixed' && d.maxSpots !== null) return `${d.maxSpots} spots`;
  if (d.capacityKind === 'unlimited') return 'Unlimited';
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
export function DivisionsSection({ divisions, teamCounts, offPlatform = false }: Props) {
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
              className="border-border-base bg-md-surface-container rounded-shape-sm space-y-2 border p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-fg text-base font-semibold">{d.label}</h3>
                <span className="text-muted text-xs">
                  {formatCapacity(d, teamCounts?.get(d.id) ?? 0, offPlatform)}
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
              {(d.winner || d.runnerUp || d.thirdPlace) && (
                <ul className="space-y-0.5 text-sm">
                  {d.winner && (
                    <li>
                      <span aria-hidden>🥇</span>{' '}
                      <span className="text-fg font-medium">{d.winner.label}</span>
                    </li>
                  )}
                  {d.runnerUp && (
                    <li className="text-muted">
                      <span aria-hidden>🥈</span>{' '}
                      <span className="text-fg">{d.runnerUp.label}</span>
                    </li>
                  )}
                  {d.thirdPlace && (
                    <li className="text-muted">
                      <span aria-hidden>🥉</span>{' '}
                      <span className="text-fg">{d.thirdPlace.label}</span>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
