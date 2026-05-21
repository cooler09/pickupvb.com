'use server';

import { revalidatePath } from 'next/cache';
import {
  AddEventDivisionCommand,
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
import { requireSession } from '@/lib/server-auth';
import { field, fieldOrUndefined } from '@/lib/form-data';

/**
 * Per ADR 0006 — server actions for division CRUD invoked by the host
 * divisions manager. Authorization is enforced by RLS on
 * `event_divisions`; we only re-check the session here.
 */

function parsePriceCents(usd: string | undefined): number | undefined {
  if (!usd) return undefined;
  const n = Number(usd);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

function divisionInputFromForm(formData: FormData): DivisionInputDto {
  const capKind = field(formData, 'capacityKind');
  const maxSpotsRaw = fieldOrUndefined(formData, 'maxSpots');
  const teamSizeRaw = fieldOrUndefined(formData, 'teamSize');
  const priceUsd = fieldOrUndefined(formData, 'priceUsd');
  const priceUnitRaw = fieldOrUndefined(formData, 'priceUnit');
  const priceUnit = priceUnitRaw === 'per_team' ? 'per_team' : 'per_player';
  const prizeText = fieldOrUndefined(formData, 'prizeText');
  const tierLabel = fieldOrUndefined(formData, 'tierLabel');

  const dto = {
    label: field(formData, 'label'),
    surface: field(formData, 'surface'),
    format: field(formData, 'format'),
    gender: field(formData, 'gender'),
    skillTier: field(formData, 'skillTier'),
    ageGroup: field(formData, 'ageGroup') || 'adult',
    teamComposition: field(formData, 'teamComposition') || 'solo',
    ...(teamSizeRaw ? { teamSize: Number(teamSizeRaw) } : {}),
    ...(tierLabel ? { tierLabel } : {}),
    capacity:
      capKind === 'fixed' && maxSpotsRaw
        ? { kind: 'fixed' as const, maxSpots: Number(maxSpotsRaw) }
        : { kind: 'unlimited' as const },
    ...(priceUsd ? { priceCents: parsePriceCents(priceUsd) } : {}),
    ...(priceUsd ? { priceUnit } : {}),
    ...(prizeText ? { prizeText } : {}),
  };
  return DivisionInputSchema.parse(dto);
}

export async function addDivisionFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  if (!eventId) return;
  const { user } = await requireSession();
  const input = divisionInputFromForm(formData);
  await handlers.addEventDivision.execute(new AddEventDivisionCommand(eventId, user.id, input));
  revalidatePath(returnPath);
}

export async function updateDivisionFromForm(
  eventId: string,
  divisionId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  if (!eventId || !divisionId) return;
  const { user } = await requireSession();
  const input = divisionInputFromForm(formData);
  const updates: DivisionUpdateDto = DivisionUpdateSchema.parse(input);
  await handlers.updateEventDivision.execute(
    new UpdateEventDivisionCommand(eventId, divisionId, user.id, updates),
  );
  revalidatePath(returnPath);
}

export async function removeDivision(
  eventId: string,
  divisionId: string,
  returnPath: string,
): Promise<void> {
  if (!eventId || !divisionId) return;
  const { user } = await requireSession();
  await handlers.removeEventDivision.execute(
    new RemoveEventDivisionCommand(eventId, divisionId, user.id),
  );
  revalidatePath(returnPath);
}
