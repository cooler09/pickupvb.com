'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, updateTag } from 'next/cache';
import { getViewer } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { geocodeAddress } from '@/lib/geocode';
import { timeZoneForCoords } from '@/lib/timezone';
import { field, fieldOrUndefined } from '@/lib/form-data';
import { parsePriceCents, parseRefundWindowHours } from '@/lib/money';
import { hasProBenefits } from '@/lib/admin';
import { clampVisibilityForHost } from '@/lib/visibility';
import { validateHostPaidEventCap } from '@/lib/host-paid-event-cap';
import { requireHostChargesEnabled } from '@/lib/host-stripe-account';
import { isPricingLocked } from '@/lib/pricing-lock';
import { validateTeamPricing } from '@/lib/event-team-pricing-validation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { SkillTier } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { notify } from '@/lib/notify';

export type EditEventState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

export async function editEventAction(
  _prev: EditEventState,
  formData: FormData,
): Promise<EditEventState> {
  const eventId = field(formData, 'eventId');
  if (!eventId) return { error: 'Missing event id.' };

  const viewer = await getViewer();
  if (!viewer) return { error: 'You must be signed in.' };
  if (viewer.isAnonymous) return { error: 'Finish claiming your account first.' };
  const { user } = viewer;

  // Authorize via the read model — `canManage` is computed using the same
  // host/co-host/group-admin rules as the detail page.
  let detail;
  try {
    detail = await handlers.getEventDetail.execute(new GetEventDetailQuery(eventId, user.id));
  } catch {
    return { error: 'Event not found.' };
  }
  if (!detail.canManage) return { error: 'You do not have permission to edit this event.' };

  // ---- Collect basic fields ----
  const title = field(formData, 'title');
  const description = fieldOrUndefined(formData, 'description') ?? '';
  const rules = fieldOrUndefined(formData, 'rules') ?? '';
  // Tournaments manage skill tier per-division on the event page; the
  // edit form only submits this field for open-play events.
  const skillTier = fieldOrUndefined(formData, 'skillTier');
  // Pro-gated: clamp non-public visibility to public when the event's
  // owning host lacks Pro benefits. Checked against `detail.hostUserId`
  // (not the editor) so a Pro co-host editing a Free host's event can't
  // promote it to invite-only. Group-only hosted events (no user host)
  // fall back to the editor's entitlement.
  const visibilityCheckUserId = detail.hostUserId ?? user.id;
  const visibility = clampVisibilityForHost(
    field(formData, 'visibility'),
    await hasProBenefits(visibilityCheckUserId),
  );
  const startsAt = field(formData, 'startsAt');
  const endsAt = field(formData, 'endsAt');

  if (!title || title.length < 3 || title.length > 120) {
    return {
      error: 'Title must be 3–120 characters.',
      fieldErrors: { title: 'Title must be 3–120 characters.' },
    };
  }
  const startsDate = new Date(startsAt);
  const endsDate = new Date(endsAt);
  if (Number.isNaN(startsDate.getTime()) || Number.isNaN(endsDate.getTime())) {
    return { error: 'Start and end times are required.' };
  }
  if (endsDate.getTime() <= startsDate.getTime()) {
    return {
      error: 'End time must be after start time.',
      fieldErrors: { endsAt: 'Must be after start.' },
    };
  }

  // ---- Capacity (open-play only; tournaments don't expose capacity here) ----
  const capacityKind = fieldOrUndefined(formData, 'capacityKind');
  const maxSpotsRaw = fieldOrUndefined(formData, 'maxSpots');
  const isOpenPlay = detail.type === 'open_play';
  const newCapacityKind = isOpenPlay ? (capacityKind === 'fixed' ? 'fixed' : 'unlimited') : null;
  const newMaxSpots =
    newCapacityKind === 'fixed' && maxSpotsRaw
      ? Math.max(1, Math.floor(Number(maxSpotsRaw)))
      : null;
  if (newCapacityKind === 'fixed' && (!newMaxSpots || !Number.isFinite(newMaxSpots))) {
    return {
      error: 'Max spots is required for fixed capacity.',
      fieldErrors: { maxSpots: 'Required.' },
    };
  }
  // Don't allow shrinking capacity below current attendee count.
  if (newCapacityKind === 'fixed' && newMaxSpots !== null) {
    const currentCount = detail.attendees.filter((a) => !a.waitlist).length;
    if (newMaxSpots < currentCount) {
      return {
        error: `Cannot set capacity below current attendee count (${currentCount}).`,
        fieldErrors: { maxSpots: `Must be ≥ ${currentCount}.` },
      };
    }
  }

  // ---- Location: re-geocode every save (cheap; keeps lat/lng accurate) ----
  const addressLine = field(formData, 'addressLine');
  const city = field(formData, 'city');
  const region = fieldOrUndefined(formData, 'region') ?? '';
  const postalCode = fieldOrUndefined(formData, 'postalCode') ?? '';
  const country = field(formData, 'country');
  let coords: { latitude: number; longitude: number };
  try {
    coords = await geocodeAddress({ addressLine, city, region, postalCode, country });
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Could not geocode address.';
    return { error: m, fieldErrors: { addressLine: m } };
  }
  const wkt = `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`;
  const timeZone = timeZoneForCoords(coords.latitude, coords.longitude);

  // ---- Pricing ----
  // Tournaments manage entry price per-division; the top-level Price input
  // is only rendered for open-play. Treat missing as "unchanged".
  const priceUsdRaw = fieldOrUndefined(formData, 'priceUsd');
  const newPriceCents = priceUsdRaw !== undefined ? parsePriceCents(priceUsdRaw) : null;
  const newRefundWindowHours = parseRefundWindowHours(
    fieldOrUndefined(formData, 'refundWindowHours'),
    { allowCustom: await hasProBenefits(user.id) },
  );
  const newHostAbsorbsFee = field(formData, 'hostAbsorbsFee') === 'on';
  const newPassProcessingFeeToBuyer = field(formData, 'passProcessingFeeToBuyer') === 'on';
  const paymentsOffPlatform = field(formData, 'paymentsOffPlatform') === 'on';

  // ADR 0012 — canonical registration-config invariants (event type ×
  // per-division team mode × division composition × price unit). ADR 0016
  // moved team-mode to the division level; division mode is unchanged in
  // this update so we replay the current modes against the resulting
  // pricing.
  {
    const resultingDivisions = detail.divisions.map((d, i) => ({
      label: d.label,
      teamComposition: d.teamComposition,
      priceUnit: d.priceUnit,
      priceCents: i === 0 && newPriceCents !== null ? newPriceCents : (d.priceCents ?? null),
      teamRegistrationMode: d.teamRegistrationMode ?? null,
    }));
    const teamPricing = validateTeamPricing({
      type: detail.type,
      paymentsOffPlatform,
      divisions: resultingDivisions,
    });
    if (!teamPricing.ok) {
      return { error: teamPricing.error };
    }
  }

  // Read current pricing to detect changes (and for the price-lock check).
  // ADR 0006 Phase 9a: price_cents now lives on event_divisions; the rest
  // remain on events. Read both in parallel.
  const admin = getAdminSupabase();
  const [curRes, curDivRes] = await Promise.all([
    admin
      .from('events')
      .select(
        'host_absorbs_fee, pass_processing_fee_to_buyer, refund_window_hours, host_id, title, starts_at, address_line, city',
      )
      .eq('id', eventId)
      .maybeSingle(),
    admin
      .from('event_divisions')
      .select('id, price_cents')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  type CurRow = {
    host_absorbs_fee: boolean;
    pass_processing_fee_to_buyer: boolean;
    refund_window_hours: number;
    host_id: string;
    title: string;
    starts_at: string;
    address_line: string;
    city: string;
  };
  type CurDivRow = { id: string; price_cents: number | null };
  const c = curRes.data as unknown as CurRow | null;
  const curDiv = (curDivRes.data as unknown as CurDivRow | null) ?? null;
  const curPriceCents = curDiv?.price_cents ?? 0;
  const priceChanged = newPriceCents !== null && curPriceCents !== newPriceCents;
  const pricingChanged = !c
    ? false
    : priceChanged ||
      c.host_absorbs_fee !== newHostAbsorbsFee ||
      c.pass_processing_fee_to_buyer !== newPassProcessingFeeToBuyer ||
      c.refund_window_hours !== newRefundWindowHours;

  if (pricingChanged) {
    const locked = await isPricingLocked(eventId);
    if (locked) {
      return {
        error:
          'Pricing is locked once the first ticket has been sold. ' +
          'Refund all attendees first to change pricing.',
      };
    }
    // If switching to paid, the host needs Stripe set up — unless they're
    // collecting off-platform.
    if (newPriceCents !== null && newPriceCents > 0 && !paymentsOffPlatform) {
      const hostIdToCheck = c?.host_id ?? user.id;
      // Free-tier cap also applies when an event flips from free→paid.
      if (curPriceCents === 0) {
        const cap = await validateHostPaidEventCap(hostIdToCheck, {
          includesCurrentEvent: false,
        });
        if (!cap.ok) return { error: cap.reason };
      }
      const stripe = await requireHostChargesEnabled(hostIdToCheck);
      if (!stripe.ok) return { error: stripe.reason };
    }
  }

  // ---- ADR 0006 event-level extension fields ------------------------------
  // All optional. Mirrors the create form. Conditional inclusion in the
  // update payload so blank inputs don't clobber existing values when the
  // host doesn't open the Advanced panel.
  const venueName = fieldOrUndefined(formData, 'venueName');
  const registrationClosesAtRaw = fieldOrUndefined(formData, 'registrationClosesAt');
  const isSeries = field(formData, 'isSeries') === 'on';
  const isFundraiser = field(formData, 'isFundraiser') === 'on';
  const isExternal = field(formData, 'isExternal') === 'on';
  const themeTagsRaw = fieldOrUndefined(formData, 'themeTags');
  const themeTags = themeTagsRaw
    ? themeTagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .slice(0, 16)
    : null;
  const extUpdate: Record<string, unknown> = {
    venue_name: venueName ?? null,
    registration_closes_at: registrationClosesAtRaw
      ? new Date(registrationClosesAtRaw).toISOString()
      : null,
    series_name: isSeries ? (fieldOrUndefined(formData, 'seriesName') ?? null) : null,
    series_position:
      isSeries && fieldOrUndefined(formData, 'seriesPosition')
        ? Number(fieldOrUndefined(formData, 'seriesPosition'))
        : null,
    series_size:
      isSeries && fieldOrUndefined(formData, 'seriesSize')
        ? Number(fieldOrUndefined(formData, 'seriesSize'))
        : null,
    is_fundraiser: isFundraiser,
    fundraiser_beneficiary: isFundraiser
      ? (fieldOrUndefined(formData, 'fundraiserBeneficiary') ?? null)
      : null,
    // `events.theme_tags` is `text[] not null default '{}'` — send an
    // empty array (not null) when the host clears all tags, otherwise
    // the UPDATE fails with a not-null violation.
    theme_tags: themeTags && themeTags.length > 0 ? themeTags : [],
    sanctioning_body: fieldOrUndefined(formData, 'sanctioningBody') ?? null,
    registration_mode: isExternal ? 'external' : 'platform',
    external_registration_url: isExternal
      ? (fieldOrUndefined(formData, 'externalRegistrationUrl') ?? null)
      : null,
    external_registration_instructions: isExternal
      ? (fieldOrUndefined(formData, 'externalRegistrationInstructions') ?? null)
      : null,
    payment_instructions: isExternal
      ? (fieldOrUndefined(formData, 'paymentInstructions') ?? null)
      : null,
    payments_off_platform: paymentsOffPlatform,
  };

  // ---- Apply update ----
  // We update via the user-session client so RLS still applies (host or
  // co-host can update; the read-model authorization above is the primary
  // gate). Pricing fields go through admin since they're sensitive.
  const supabase = await getServerSupabase();
  const { error: updErr } = await supabase
    .from('events')
    .update({
      title,
      description,
      rules,
      visibility,
      starts_at: startsDate.toISOString(),
      ends_at: endsDate.toISOString(),
      address_line: addressLine,
      city,
      region,
      postal_code: postalCode,
      country,
      geo: wkt,
      time_zone: timeZone,
      ...extUpdate,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', eventId);
  if (updErr) return { error: `Update failed: ${updErr.message}` };

  // ADR 0006 Phase 9c: skill_level, capacity_kind and max_spots now live on
  // event_divisions. Write them to the primary (sort_order=0) division.
  // Tournaments edit per-division skill on the event page; only open-play
  // submits a top-level skillTier here.
  if (curDiv && (isOpenPlay || skillTier)) {
    const divisionUpdate: Record<string, unknown> = {};
    if (skillTier) divisionUpdate.skill_tier = skillTier as SkillTier;
    if (isOpenPlay) {
      divisionUpdate.capacity_kind = newCapacityKind;
      divisionUpdate.max_spots = newMaxSpots;
    }
    if (Object.keys(divisionUpdate).length > 0) {
      const { error: divErr } = await admin
        .from('event_divisions')
        .update(divisionUpdate as never)
        .eq('id', curDiv.id);
      if (divErr) return { error: `Update failed: ${divErr.message}` };
    }
  }

  if (pricingChanged) {
    // host_absorbs_fee + refund_window_hours stay on events; price_cents
    // moved to event_divisions in Phase 9a.
    const { error: priceErr } = await admin
      .from('events')
      .update({
        host_absorbs_fee: newHostAbsorbsFee,
        pass_processing_fee_to_buyer: newPassProcessingFeeToBuyer,
        refund_window_hours: newRefundWindowHours,
      } as never)
      .eq('id', eventId);
    if (priceErr) return { error: `Pricing update failed: ${priceErr.message}` };
    if (curDiv && newPriceCents !== null) {
      const { error: divPriceErr } = await admin
        .from('event_divisions')
        .update({ price_cents: newPriceCents } as never)
        .eq('id', curDiv.id);
      if (divPriceErr) {
        return { error: `Pricing update failed: ${divPriceErr.message}` };
      }
    }
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/edit`);
  revalidatePath('/events');
  // `revalidatePath` does not evict `unstable_cache` entries — the event
  // detail page reads through helpers tagged `event:<id>` (see
  // _loaders/load-event-detail.ts), so we must also bust the tag or the
  // detail page will keep rendering the stale title/time/etc.
  updateTag(`event:${eventId}`);

  // Notify attendees if user-visible fields changed. Best-effort.
  if (c) {
    const changes: string[] = [];
    if (c.title !== title) changes.push('title');
    if (new Date(c.starts_at).getTime() !== startsDate.getTime()) changes.push('time');
    if (c.address_line !== addressLine || c.city !== city) changes.push('location');
    if (pricingChanged) changes.push('price');
    if (changes.length > 0) {
      try {
        const { data: attRows } = await admin
          .from('event_participants')
          .select('user_id, division:event_divisions!inner(event_id)')
          .eq('role', 'attendee')
          .eq('division.event_id', eventId);
        const attendees = (attRows as { user_id: string }[] | null) ?? [];
        const summary = `Updated: ${changes.join(', ')}`;
        const stamp = Date.now(); // distinct idem per edit
        for (const a of attendees) {
          await notify(
            'event.updated',
            a.user_id,
            { eventId, eventTitle: title, changeSummary: summary },
            { idempotencyKey: `${eventId}:${a.user_id}:${stamp}` },
          );
        }
      } catch {
        // best-effort
      }
    }
  }

  redirect(`/events/${eventId}`);
}
