/**
 * Boundary mirror of `VolleyballEvent.assertRegistrationConfigValid` —
 * see [docs/adr/0012-registration-paradigm-invariants.md](../../../../docs/adr/0012-registration-paradigm-invariants.md).
 *
 * The canonical matrix (event type × team mode × division composition ×
 * division price unit) is enforced inside the domain aggregate so it
 * cannot be bypassed, but the domain only throws `InvariantViolation`.
 * Reproducing the rules here lets the create/edit form surface a useful
 * error message before save and short-circuit before reaching the
 * application layer.
 *
 * The price-unit constraint is **skipped for free divisions**
 * (`priceCents === 0` or `null`) — with no money to route, per-player vs.
 * per-team is a meaningless distinction. Server actions normalize the
 * unit on the way in so persisted rows stay coherent. Off-platform
 * payments do **not** relax any of the other rules.
 */

export type TeamPricingDivisionInput = {
  label: string;
  teamComposition: 'solo' | 'team' | 'pair_draw' | 'partners';
  priceUnit: 'per_player' | 'per_team';
  priceCents: number | null;
  /** ADR 0016: per-division team registration paradigm. */
  teamRegistrationMode: 'ad_hoc' | 'roster' | null;
};

export type TeamPricingValidationInput = {
  type: 'open_play' | 'tournament' | 'league';
  paymentsOffPlatform: boolean;
  divisions: ReadonlyArray<TeamPricingDivisionInput>;
};

export type TeamPricingValidationResult = { ok: true } | { ok: false; error: string };

export function validateTeamPricing(
  input: TeamPricingValidationInput,
): TeamPricingValidationResult {
  for (const d of input.divisions) {
    const mode = d.teamRegistrationMode;
    const isTeamLed = mode === 'ad_hoc' || mode === 'roster';
    const isIndividual = mode === null;
    const isFree = (d.priceCents ?? 0) <= 0;

    // Rule 1: open-play is individual-only on every division.
    if (input.type === 'open_play' && !isIndividual) {
      return {
        ok: false,
        error:
          `Open-play events must use individual signup. Division “${d.label}” has team registration ` +
          `set — switch the division to “none” or change the event type to tournament.`,
      };
    }

    // Rule 2: team-led divisions require team composition.
    // The per-team price-unit constraint only kicks in for paid divisions.
    if (isTeamLed) {
      if (d.teamComposition === 'solo') {
        return {
          ok: false,
          error:
            `Team-registered divisions cannot use solo composition. ` +
            `Division “${d.label}” must use team, pair-draw, or partner-required composition.`,
        };
      }
      if (!isFree && d.priceUnit === 'per_player') {
        return {
          ok: false,
          error:
            `Team-registered divisions require per-team pricing. Division “${d.label}” is priced per-player — ` +
            `the captain pays for the team. Switch the division to per-team pricing, or disable team registration on the division.`,
        };
      }
    }

    // Rule 3: individual divisions require solo composition.
    // The per-player price-unit constraint only kicks in for paid divisions.
    if (isIndividual) {
      if (d.teamComposition !== 'solo') {
        return {
          ok: false,
          error:
            `Individual-signup divisions must use solo composition. Division “${d.label}” has team composition ` +
            `“${d.teamComposition}” — enable team registration on the division, or switch the division to solo.`,
        };
      }
      if (!isFree && d.priceUnit === 'per_team') {
        return {
          ok: false,
          error:
            `Individual-signup divisions cannot use per-team pricing. Division “${d.label}” must be priced per-player, ` +
            `or enable team registration on the division.`,
        };
      }
    }
  }

  return { ok: true };
}
