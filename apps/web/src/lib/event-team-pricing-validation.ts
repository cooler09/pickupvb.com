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
 * Off-platform payments do **not** relax any of these rules.
 */

export type TeamPricingDivisionInput = {
  label: string;
  teamComposition: 'solo' | 'team' | 'pair_draw' | 'partner_required';
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
  const mode = input.teamRegistrationMode;
  const isTeamLed = mode === 'ad_hoc' || mode === 'roster';
  const isIndividual = mode === null;

  // Rule 1: open-play is individual-only.
  if (input.type === 'open_play' && !isIndividual) {
    return {
      ok: false,
      error:
        'Open-play events must use individual signup. Set team registration to “none” or change the event type to tournament.',
    };
  }

  for (const d of input.divisions) {
    // Rule 2: team-led events require team composition + per-team price.
    if (isTeamLed) {
      if (d.teamComposition === 'solo') {
        return {
          ok: false,
          error:
            `Team-registered events cannot have a solo-composition division. ` +
            `Division “${d.label}” must use team, pair-draw, or partner-required composition.`,
        };
      }
      if (d.priceUnit === 'per_player') {
        return {
          ok: false,
          error:
            `Team-registered events require per-team pricing. Division “${d.label}” is priced per-player — ` +
            `the captain pays for the team. Switch the division to per-team pricing, or disable team registration on the event.`,
        };
      }
    }

    // Rule 3: individual events require solo composition + per-player price.
    if (isIndividual) {
      if (d.teamComposition !== 'solo') {
        return {
          ok: false,
          error:
            `Individual-signup events must use solo divisions. Division “${d.label}” has team composition ` +
            `“${d.teamComposition}” — enable team registration on the event, or switch the division to solo.`,
        };
      }
      if (d.priceUnit === 'per_team') {
        return {
          ok: false,
          error:
            `Individual-signup events cannot use per-team pricing. Division “${d.label}” must be priced per-player, ` +
            `or enable team registration on the event.`,
        };
      }
    }
  }

  return { ok: true };
}
