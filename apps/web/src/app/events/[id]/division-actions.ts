'use server';

import { revalidatePath } from 'next/cache';
import {
  AddEventDivisionCommand,
  GetEventDetailQuery,
  RemoveEventDivisionCommand,
  UpdateEventDivisionCommand,
} from '@pickupvb/application';
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

export async function addDivisionFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  if (!eventId) return;
  const userId = await assertCanManage(eventId);
  const input = divisionInputFromForm(formData);
  await handlers.addEventDivision.execute(new AddEventDivisionCommand(eventId, userId, input));
  revalidatePath(returnPath);
}

export async function updateDivisionFromForm(
  eventId: string,
  divisionId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  if (!eventId || !divisionId) return;
  const userId = await assertCanManage(eventId);
  const input = divisionInputFromForm(formData);
  const updates: DivisionUpdateDto = DivisionUpdateSchema.parse(input);
  await handlers.updateEventDivision.execute(
    new UpdateEventDivisionCommand(eventId, divisionId, userId, updates),
  );
  revalidatePath(returnPath);
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
