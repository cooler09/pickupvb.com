/**
 * ADR 0007 §3 — Forbid the combination
 *   `team_registration_mode IN ('ad_hoc' | 'roster')`
 *   + at least one division priced `per_player`
 *   + on-platform payments (not `payments_off_platform`).
 *
 * In that combination the platform would be unable to collect: the
 * tournament is team-led, so registration happens at the team level, but
 * each priced division charges per-player — so there is no captain-pays-team
 * checkout path that satisfies the price unit. The host must pick one of
 * three resolutions:
 *
 *   1. Switch the offending division(s) to `per_team` pricing (a captain
 *      pays one fee for the team).
 *   2. Disable team registration on the event (open per-player signup
 *      where each player pays their own ticket).
 *   3. Set the event to off-platform payments so the host collects the
 *      money outside Stripe.
 *
 * The same rule is enforced at both event-create and event-edit
 * boundaries so a misconfigured combo can neither be created nor saved.
 */

export type TeamPricingDivisionInput = {
  label: string;
  priceUnit: 'per_player' | 'per_team';
  priceCents: number | null;
};

export type TeamPricingValidationInput = {
  type: 'open_play' | 'tournament';
  teamRegistrationMode: 'ad_hoc' | 'roster' | null;
  paymentsOffPlatform: boolean;
  divisions: ReadonlyArray<TeamPricingDivisionInput>;
};

export type TeamPricingValidationResult = { ok: true } | { ok: false; error: string };

export function validateTeamPricing(
  input: TeamPricingValidationInput,
): TeamPricingValidationResult {
  // Rule only applies to tournaments in a team-led registration mode.
  if (input.type !== 'tournament') return { ok: true };
  if (input.teamRegistrationMode == null) return { ok: true };
  if (input.paymentsOffPlatform) return { ok: true };

  const offending = input.divisions.filter(
    (d) => d.priceUnit === 'per_player' && (d.priceCents ?? 0) > 0,
  );
  if (offending.length === 0) return { ok: true };

  const labels = offending.map((d) => `“${d.label}”`).join(', ');
  return {
    ok: false,
    error:
      `This event uses team registration, but ${labels} ${offending.length === 1 ? 'is' : 'are'} priced per-player. ` +
      `On-platform checkout has no way to collect a per-player fee from a team registration. ` +
      `Choose one of: ` +
      `(1) switch the priced division${offending.length === 1 ? '' : 's'} to “per team” pricing so the captain pays one fee; ` +
      `(2) turn off team registration so each player signs up and pays individually; or ` +
      `(3) collect payment off-platform.`,
  };
}
