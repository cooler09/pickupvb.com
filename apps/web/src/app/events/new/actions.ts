'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { CreateEventSchema } from '@pickupvb/types';
import { CreateEventCommand, JoinEventCommand } from '@pickupvb/application';
import { EVENT_POSITIONS, EventType, SkillTier, skillTierBand } from '@pickupvb/domain';
import { handlers, analytics } from '@/lib/handlers';
import { bool, field, fieldOrUndefined } from '@/lib/form-data';
import { getViewer } from '@/lib/server-auth';
import { geocodeAddress } from '@/lib/geocode';
import { timeZoneForCoords } from '@/lib/timezone';
import { parsePriceCents, parseRefundWindowHours } from '@/lib/money';
import { hasProBenefits } from '@/lib/admin';
import { clampVisibilityForHost } from '@/lib/visibility';
import { validateHostPaidEventCap } from '@/lib/host-paid-event-cap';
import { requireHostChargesEnabled } from '@/lib/host-stripe-account';
import { validateTeamPricing } from '@/lib/event-team-pricing-validation';

export type CreateEventState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** True once any submission has been attempted (success or failure). */
  submitted?: boolean;
  /** Snapshot of submitted form values, echoed back so uncontrolled inputs
   *  can restore the user's entries when the action returns an error. */
  values?: Record<string, string>;
};

/** Collect string entries from a FormData for echo-on-error. */
function snapshot(formData: FormData): { submitted: true; values: Record<string, string> } {
  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === 'string') values[k] = v;
  }
  return { submitted: true, values };
}

export async function createEventAction(
  _prev: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const viewer = await getViewer();
  if (!viewer) return { ...snapshot(formData), error: 'You must be signed in to host an event.' };
  if (viewer.isAnonymous)
    return {
      ...snapshot(formData),
      error: 'Finish claiming your account before hosting an event.',
    };
  const { supabase, user } = viewer;

  const type = field(formData, 'type');
  const capacityKind = field(formData, 'capacityKind') || 'unlimited';
  const maxSpotsRaw = fieldOrUndefined(formData, 'maxSpots');
  const byPosition = field(formData, 'byPosition') === 'on';
  const positionRoster: Record<string, number> = {};
  if (byPosition) {
    for (const pos of EVENT_POSITIONS) {
      const raw = fieldOrUndefined(formData, `position_${pos}`);
      const n = raw ? Math.max(0, Math.floor(Number(raw))) : 0;
      if (Number.isFinite(n) && n > 0) positionRoster[pos] = n;
    }
  }

  const addressLine = field(formData, 'addressLine');
  const city = field(formData, 'city');
  const region = field(formData, 'region');
  const postalCode = field(formData, 'postalCode');
  const country = field(formData, 'country');

  let coords: { latitude: number; longitude: number };
  try {
    coords = await geocodeAddress({ addressLine, city, region, postalCode, country });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not geocode address.';
    return {
      ...snapshot(formData),
      error: message,
      fieldErrors: { 'location.addressLine': message },
    };
  }

  // ---- ADR 0006 event-level extensions ------------------------------------
  const isExternal = field(formData, 'isExternal') === 'on';
  const isFundraiser = field(formData, 'isFundraiser') === 'on';
  const isSeries = field(formData, 'isSeries') === 'on';
  const themeTagsRaw = fieldOrUndefined(formData, 'themeTags');
  const themeTags = themeTagsRaw
    ? themeTagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .slice(0, 16)
    : undefined;
  const registrationClosesAtRaw = fieldOrUndefined(formData, 'registrationClosesAt');
  const extensions = {
    ...(fieldOrUndefined(formData, 'venueName')
      ? { venueName: fieldOrUndefined(formData, 'venueName') }
      : {}),
    ...(registrationClosesAtRaw ? { registrationClosesAt: registrationClosesAtRaw } : {}),
    ...(isSeries && fieldOrUndefined(formData, 'seriesName')
      ? { seriesName: fieldOrUndefined(formData, 'seriesName') }
      : {}),
    ...(isSeries && fieldOrUndefined(formData, 'seriesPosition')
      ? { seriesPosition: Number(fieldOrUndefined(formData, 'seriesPosition')) }
      : {}),
    ...(isSeries && fieldOrUndefined(formData, 'seriesSize')
      ? { seriesSize: Number(fieldOrUndefined(formData, 'seriesSize')) }
      : {}),
    ...(isFundraiser ? { isFundraiser: true } : {}),
    ...(isFundraiser && fieldOrUndefined(formData, 'fundraiserBeneficiary')
      ? { fundraiserBeneficiary: fieldOrUndefined(formData, 'fundraiserBeneficiary') }
      : {}),
    ...(themeTags && themeTags.length > 0 ? { themeTags } : {}),
    ...(fieldOrUndefined(formData, 'sanctioningBody')
      ? { sanctioningBody: fieldOrUndefined(formData, 'sanctioningBody') }
      : {}),
    ...(isExternal
      ? {
          registrationMode: 'external' as const,
          ...(fieldOrUndefined(formData, 'externalRegistrationUrl')
            ? { externalRegistrationUrl: fieldOrUndefined(formData, 'externalRegistrationUrl') }
            : {}),
          ...(fieldOrUndefined(formData, 'externalRegistrationInstructions')
            ? {
                externalRegistrationInstructions: fieldOrUndefined(
                  formData,
                  'externalRegistrationInstructions',
                ),
              }
            : {}),
          ...(fieldOrUndefined(formData, 'paymentInstructions')
            ? { paymentInstructions: fieldOrUndefined(formData, 'paymentInstructions') }
            : {}),
        }
      : {
          ...(fieldOrUndefined(formData, 'paymentInstructions')
            ? { paymentInstructions: fieldOrUndefined(formData, 'paymentInstructions') }
            : {}),
          ...(field(formData, 'paymentsOffPlatform') === 'on' ? { paymentsOffPlatform: true } : {}),
        }),
  };

  // ---- ADR 0006 additional divisions --------------------------------------
  const divCount = Math.max(0, Number(fieldOrUndefined(formData, 'div_count') ?? 0));
  const divisions: Array<Record<string, unknown>> = [];
  for (let i = 0; i < divCount; i++) {
    const label = fieldOrUndefined(formData, `div_${i}_label`);
    if (!label) continue; // user added a row then cleared it
    const teamComposition = fieldOrUndefined(formData, `div_${i}_teamComposition`) || 'solo';
    const capKind = fieldOrUndefined(formData, `div_${i}_capacityKind`) || 'unlimited';
    const maxSpots = fieldOrUndefined(formData, `div_${i}_maxSpots`);
    const priceUsd = fieldOrUndefined(formData, `div_${i}_priceUsd`);
    const priceUnitRaw = fieldOrUndefined(formData, `div_${i}_priceUnit`);
    const priceUnit = priceUnitRaw === 'per_team' ? 'per_team' : 'per_player';
    const prizeText = fieldOrUndefined(formData, `div_${i}_prizeText`);
    // R2: per-division free-agent opt-out. Default true (matches the
    // historical behaviour all existing divisions were created under).
    const allowFreeAgents = bool(formData, `div_${i}_allowFreeAgents`);
    // ADR 0016: per-division team registration paradigm. For tournaments,
    // default to ad_hoc when the composition is non-solo, else null. The
    // host can override per row via the picker.
    const isTournamentRow = type === EventType.Tournament;
    const teamRegModeRaw = fieldOrUndefined(formData, `div_${i}_teamRegistrationMode`);
    let teamRegistrationMode: 'ad_hoc' | 'roster' | null;
    if (teamRegModeRaw === 'ad_hoc') teamRegistrationMode = 'ad_hoc';
    else if (teamRegModeRaw === 'roster') teamRegistrationMode = 'roster';
    else if (teamRegModeRaw === 'none') teamRegistrationMode = null;
    else teamRegistrationMode = isTournamentRow && teamComposition !== 'solo' ? 'ad_hoc' : null;
    divisions.push({
      label,
      surface: fieldOrUndefined(formData, `div_${i}_surface`) || 'indoor',
      format: fieldOrUndefined(formData, `div_${i}_format`) || 'sixes',
      gender: fieldOrUndefined(formData, `div_${i}_gender`) || 'coed',
      skillTier: fieldOrUndefined(formData, `div_${i}_skillTier`) || 'bb',
      ageGroup: fieldOrUndefined(formData, `div_${i}_ageGroup`) || 'adult',
      teamComposition,
      capacity:
        capKind === 'fixed' && maxSpots
          ? { kind: 'fixed' as const, maxSpots: Number(maxSpots) }
          : { kind: 'unlimited' as const },
      ...(priceUsd ? { priceCents: parsePriceCents(priceUsd) } : {}),
      ...(priceUsd ? { priceUnit } : {}),
      ...(prizeText ? { prizeText } : {}),
      allowFreeAgents,
      teamRegistrationMode,
    });
  }

  const isTournament = type === EventType.Tournament;
  if (isTournament && !isExternal && divisions.length === 0) {
    return {
      ...snapshot(formData),
      error: 'Add at least one division for your tournament.',
      fieldErrors: { divisions: 'Add at least one division.' },
    };
  }

  // ADR 0012 — canonical registration-config invariants (event type ×
  // per-division team mode × division composition × price unit). ADR 0016
  // moved team-mode to the division level.
  if (isTournament && !isExternal) {
    const teamPricing = validateTeamPricing({
      type: 'tournament',
      paymentsOffPlatform: field(formData, 'paymentsOffPlatform') === 'on',
      divisions: divisions.map((d) => ({
        label: (d.label as string) ?? '',
        teamComposition: ((d.teamComposition as string) ?? 'solo') as
          | 'solo'
          | 'team'
          | 'pair_draw'
          | 'partner_required',
        priceUnit: ((d.priceUnit as string) ?? 'per_player') as 'per_player' | 'per_team',
        priceCents: typeof d.priceCents === 'number' ? d.priceCents : null,
        teamRegistrationMode:
          (d.teamRegistrationMode as 'ad_hoc' | 'roster' | null | undefined) ?? null,
      })),
    });
    if (!teamPricing.ok) {
      return { ...snapshot(formData), error: teamPricing.error };
    }
  }

  // For tournaments the per-division grid is the single source of truth for
  // surface/format/gender/skill. Fall back to division[0] so the legacy
  // top-level columns on `events` (still required by the schema) stay
  // populated. Open-play and external still submit them directly.
  const primaryDiv = isTournament && divisions.length > 0 ? divisions[0]! : undefined;
  const topSurface = (primaryDiv?.surface as string | undefined) ?? field(formData, 'surface');
  const topFormat =
    (primaryDiv?.format as string | undefined) ?? fieldOrUndefined(formData, 'format');
  const topGender =
    (primaryDiv?.gender as string | undefined) ?? fieldOrUndefined(formData, 'gender');
  const topSkillTier =
    (primaryDiv?.skillTier as SkillTier | undefined) ??
    (fieldOrUndefined(formData, 'skillTier') as SkillTier | undefined) ??
    SkillTier.BB;

  const raw = {
    title: field(formData, 'title'),
    description: field(formData, 'description'),
    rules: field(formData, 'rules'),
    surface: topSurface,
    format: topFormat,
    gender: topGender,
    // The form submits the precise SkillTier (matching the per-division
    // selects); the create command still takes the legacy 4-bucket band, so
    // derive it. Falls back to 'bb' (intermediate) if the field is missing.
    skillLevel: skillTierBand(topSkillTier),
    type,
    // Non-public visibility modes are a Pro perk (audit P1 #1). Clamp
    // server-side so the rule can't be bypassed by editing the form HTML.
    visibility: clampVisibilityForHost(
      fieldOrUndefined(formData, 'visibility'),
      await hasProBenefits(user.id),
    ),
    location: {
      addressLine,
      city,
      region,
      postalCode,
      country,
      latitude: coords.latitude,
      longitude: coords.longitude,
    },
    timeZone: timeZoneForCoords(coords.latitude, coords.longitude),
    startsAt: field(formData, 'startsAt'),
    endsAt: field(formData, 'endsAt'),
    capacity:
      type === EventType.OpenPlay
        ? byPosition
          ? { kind: 'unlimited' as const }
          : capacityKind === 'fixed' && maxSpotsRaw
            ? { kind: 'fixed' as const, maxSpots: Number(maxSpotsRaw) }
            : { kind: 'unlimited' as const }
        : undefined,
    ...(byPosition && Object.keys(positionRoster).length > 0 ? { positionRoster } : {}),
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
    ...(divisions.length > 0 ? { divisions } : {}),
  };

  let dto;
  try {
    dto = CreateEventSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const path = issue.path.join('.');
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
      }
      return { ...snapshot(formData), error: 'Please fix the highlighted fields.', fieldErrors };
    }
    return { ...snapshot(formData), error: 'Could not parse form input.' };
  }

  let result: { id: string };
  try {
    result = await handlers.createEvent.execute(new CreateEventCommand(user.id, dto));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create event.';
    return { ...snapshot(formData), error: message };
  }

  // If the user chose to host on behalf of a group, attach it to the row.
  // RLS on events_update enforces they're owner/admin of that group.
  const hostGroupId = fieldOrUndefined(formData, 'hostGroupId');
  if (hostGroupId) {
    const { error: groupErr } = await supabase
      .from('events')
      .update({ host_group_id: hostGroupId } as never)
      .eq('id', result.id);
    if (groupErr) {
      return {
        ...snapshot(formData),
        error: `Event created, but couldn't set group host: ${groupErr.message}`,
      };
    }
  }

  // Pricing: open-play uses the top-level priceUsd input. Tournaments price
  // per-division (already collected above); for Stripe gating we treat the
  // highest division price as the event price. Free events (price = 0) skip
  // Stripe entirely.
  const priceCents = isTournament
    ? divisions.reduce(
        (max, d) => Math.max(max, typeof d.priceCents === 'number' ? (d.priceCents as number) : 0),
        0,
      )
    : parsePriceCents(fieldOrUndefined(formData, 'priceUsd'));
  const paymentsOffPlatform = field(formData, 'paymentsOffPlatform') === 'on';
  if (priceCents > 0 && !paymentsOffPlatform) {
    // Free hosts are capped at 1 paid event per 30 days. Pro hosts have
    // no cap. Check BEFORE creating Stripe Checkout, so we can roll back
    // the event row cleanly. Count already includes the row we just
    // inserted.
    const cap = await validateHostPaidEventCap(user.id, { includesCurrentEvent: true });
    if (!cap.ok) {
      await supabase.from('events').delete().eq('id', result.id);
      return { ...snapshot(formData), error: cap.reason };
    }
    const stripe = await requireHostChargesEnabled(user.id);
    if (!stripe.ok) {
      // Roll back the event so the host doesn't end up with a free
      // event they thought was paid.
      await supabase.from('events').delete().eq('id', result.id);
      return { ...snapshot(formData), error: stripe.reason };
    }
    const refundWindowHours = parseRefundWindowHours(
      fieldOrUndefined(formData, 'refundWindowHours'),
      { allowCustom: await hasProBenefits(user.id) },
    );
    const hostAbsorbsFee = field(formData, 'hostAbsorbsFee') === 'on';
    const passProcessingFeeToBuyer = field(formData, 'passProcessingFeeToBuyer') === 'on';
    const { error: priceErr } = await supabase
      .from('events')
      .update({
        host_absorbs_fee: hostAbsorbsFee,
        pass_processing_fee_to_buyer: passProcessingFeeToBuyer,
        refund_window_hours: refundWindowHours,
      } as never)
      .eq('id', result.id);
    if (priceErr) {
      return {
        ...snapshot(formData),
        error: `Event created, but pricing failed: ${priceErr.message}`,
      };
    }
    // Pricing now lives on event_divisions (ADR 0006 Phase 9a). For
    // open-play we update the first (default) division here. Tournaments
    // already supplied per-division priceCents through the create handler.
    if (!isTournament) {
      const { error: divPriceErr } = await supabase
        .from('event_divisions')
        .update({ price_cents: priceCents } as never)
        .eq('event_id', result.id)
        .eq('sort_order', 0);
      if (divPriceErr) {
        return {
          ...snapshot(formData),
          error: `Event created, but pricing failed: ${divPriceErr.message}`,
        };
      }
    }
  }

  // Auto-add the host to the attendee list when they opted in (open-play
  // only — tournaments use team signup). Best-effort: a failure here
  // shouldn't block the redirect to the event the host just created;
  // they can always click Join from the detail page. Skipped for paid
  // events (host shouldn't have to buy a ticket to their own event) and
  // for by-position events (the host picks their position from the event
  // page — see the joinAsHost label copy in new-event-form.tsx).
  if (
    priceCents === 0 &&
    dto.type === EventType.OpenPlay &&
    !byPosition &&
    field(formData, 'joinAsHost') === 'on'
  ) {
    try {
      await handlers.joinEvent.execute(new JoinEventCommand(result.id, user.id));
    } catch {
      // Swallow — the event exists; auto-join is a convenience.
    }
  }

  // Capture `event_published` after the row is durable (including any
  // pricing / division updates above). Fire-and-forget; the adapter
  // swallows network errors so analytics can't break the create flow.
  // See docs/audits/analytics.md (P1 #1/#2).
  analytics.capture(
    {
      name: 'event_published',
      props: {
        eventId: result.id,
        hostId: user.id,
        eventType: isTournament ? 'tournament' : 'open_play',
        byPosition,
        priceCents,
        metroId: city ?? null,
        capacity: dto.capacity?.kind === 'fixed' ? (dto.capacity.maxSpots as number) : null,
      },
    },
    user.id,
  );

  revalidatePath('/events');
  redirect(`/events/${result.id}?created=1`);
}
