'use server';

import { revalidatePath } from 'next/cache';
import {
  AddEventDivisionCommand,
  GetEventDetailQuery,
  RemoveEventDivisionCommand,
  UpdateEventDivisionCommand,
} from '@pickupvb/application';
import { DomainError } from '@pickupvb/domain';
import {
  DivisionInputSchema,
  DivisionUpdateSchema,
  type DivisionInputDto,
  type DivisionUpdateDto,
} from '@pickupvb/types';
import { handlers } from '@/lib/handlers';
import { getViewer } from '@/lib/server-auth';
import { redirectEventNotice } from '@/lib/server-redirects';
import { bool, field, fieldOrUndefined } from '@/lib/form-data';

/**
 * Per ADR 0006 — server actions for division CRUD invoked by the host
 * divisions manager.
 *
 * Authorization is enforced HERE: the handlers write through the shared
 * `SupabaseEventRepository`, which runs on the service-role admin client (RLS
 * bypassed — sanctioned for host-gated ops, AGENTS.md pitfall #8), so RLS on
 * `event_divisions` never fires. `assertCanManage` gates on `canManage` — the
 * host / co-host / group-owner-or-admin set the divisions manager UI exposes.
 * (Security audit P1 #12.)
 */
async function assertCanManage(eventId: string): Promise<string> {
  const viewer = await getViewer();
  if (!viewer || viewer.isAnonymous) redirectEventNotice(eventId, 'rsvp', 'forbidden');
  const detail = await handlers.getEventDetail.execute(
    new GetEventDetailQuery(eventId, viewer.user.id),
  );
  if (!detail.canManage) redirectEventNotice(eventId, 'rsvp', 'forbidden');
  return viewer.user.id;
}

function parsePriceCents(usd: string | undefined): number | undefined {
  if (!usd) return undefined;
  const n = Number(usd);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

function divisionInputFromForm(formData: FormData): DivisionInputDto {
  const capKind = field(formData, 'capacityKind');
  const maxSpotsRaw = fieldOrUndefined(formData, 'maxSpots');
  const priceUsd = fieldOrUndefined(formData, 'priceUsd');
  const priceUnitRaw = fieldOrUndefined(formData, 'priceUnit');
  const priceUnitFromForm = priceUnitRaw === 'per_team' ? 'per_team' : 'per_player';
  const prizeText = fieldOrUndefined(formData, 'prizeText');
  const tierLabel = fieldOrUndefined(formData, 'tierLabel');

  // ADR 0016 — read team-mode early so we can normalize the price unit
  // for free divisions (where the picker is hidden in the UI).
  const teamRegRaw = fieldOrUndefined(formData, 'teamRegistrationMode');
  const teamMode: 'ad_hoc' | 'roster' | null =
    teamRegRaw === 'ad_hoc' ? 'ad_hoc' : teamRegRaw === 'roster' ? 'roster' : null;

  // ADR 0012 — free divisions skip the price-unit constraint; normalize
  // the stored unit so it always matches the registration mode.
  const priceCentsParsed = priceUsd ? parsePriceCents(priceUsd) : undefined;
  const isFree = !priceCentsParsed || priceCentsParsed <= 0;
  const priceUnit = isFree ? (teamMode === null ? 'per_player' : 'per_team') : priceUnitFromForm;

  const dto = {
    label: field(formData, 'label'),
    surface: field(formData, 'surface'),
    format: field(formData, 'format'),
    gender: field(formData, 'gender'),
    skillTier: field(formData, 'skillTier'),
    ageGroup: field(formData, 'ageGroup') || 'adult',
    teamComposition: field(formData, 'teamComposition') || 'solo',
    ...(tierLabel ? { tierLabel } : {}),
    capacity:
      capKind === 'fixed' && maxSpotsRaw
        ? { kind: 'fixed' as const, maxSpots: Number(maxSpotsRaw) }
        : { kind: 'unlimited' as const },
    ...(priceUsd ? { priceCents: parsePriceCents(priceUsd) } : {}),
    ...(priceUsd ? { priceUnit } : {}),
    ...(prizeText ? { prizeText } : {}),
    // R2: present whenever the form renders the checkbox; defaults to true
    // for legacy hosts editing rows from before the column existed.
    allowFreeAgents: bool(formData, 'allowFreeAgents'),
    // ADR 0016 — per-division team registration paradigm. Form sends
    // 'ad_hoc' | 'roster' | 'none'; map 'none' → null.
    ...(teamRegRaw === 'ad_hoc'
      ? { teamRegistrationMode: 'ad_hoc' as const }
      : teamRegRaw === 'roster'
        ? { teamRegistrationMode: 'roster' as const }
        : teamRegRaw === 'none'
          ? { teamRegistrationMode: null }
          : {}),
  };
  return DivisionInputSchema.parse(dto);
}

/**
 * Inline form state for the add/edit-division modals. Mirrors the
 * `TeamFormState` convention (apps/web/src/app/teams/actions.ts): an optional
 * `error` string rendered via `<Alert>`, plus a `success` flag the modal
 * watches to close itself.
 *
 * Why this exists: the registration-config matrix
 * (`VolleyballEvent.assertRegistrationConfigValid`, ADR 0012/0016 — e.g. a
 * per-player *paid* division can't be team-registered) throws a typed
 * `InvariantViolation` from inside `add/updateDivision`. The plain
 * `<form action>` had no catch, so the throw bubbled out as an unhandled
 * server error → a Next 500 with a `digest` instead of a host-facing message.
 * Catching `DomainError` here turns it into actionable inline feedback; the
 * message itself already tells the host how to fix the config.
 */
export type DivisionFormState = { error?: string; success?: boolean };

export async function addDivisionFromForm(
  eventId: string,
  returnPath: string,
  _prev: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> {
  if (!eventId) return { error: 'Missing event.' };
  const userId = await assertCanManage(eventId);
  const input = divisionInputFromForm(formData);
  try {
    await handlers.addEventDivision.execute(new AddEventDivisionCommand(eventId, userId, input));
  } catch (err) {
    // Typed domain failures carry a host-facing message — surface it inline.
    // Anything else is genuinely unexpected: rethrow so it reaches Sentry.
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath(returnPath);
  return { success: true };
}

export async function updateDivisionFromForm(
  eventId: string,
  divisionId: string,
  returnPath: string,
  _prev: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> {
  if (!eventId || !divisionId) return { error: 'Missing event or division.' };
  const userId = await assertCanManage(eventId);
  const input = divisionInputFromForm(formData);
  const updates: DivisionUpdateDto = DivisionUpdateSchema.parse(input);
  try {
    await handlers.updateEventDivision.execute(
      new UpdateEventDivisionCommand(eventId, divisionId, userId, updates),
    );
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath(returnPath);
  return { success: true };
}

export async function removeDivision(
  eventId: string,
  divisionId: string,
  returnPath: string,
): Promise<void> {
  if (!eventId || !divisionId) return;
  const userId = await assertCanManage(eventId);
  await handlers.removeEventDivision.execute(
    new RemoveEventDivisionCommand(eventId, divisionId, userId),
  );
  revalidatePath(returnPath);
}
