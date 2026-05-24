'use server';

/**
 * Server actions for ad-hoc team registrations (ADR 0007).
 *
 * Each `*FromForm` is a thin FormData adapter around an application
 * handler. Bind the path-specific args at the call site:
 *
 *   <form action={registerAdHocTeamFromForm.bind(null, eventId, returnPath)}>
 *
 * Outcomes are surfaced via `?rsvp=<code>` query params resolved by
 * [event-rsvp-flash.ts](apps/web/src/lib/event-rsvp-flash.ts).
 */

import { revalidatePath, updateTag } from 'next/cache';
import {
  AddAdHocTeamMemberCommand,
  RegisterAdHocTeamCommand,
  RemoveAdHocTeamMemberCommand,
  RenameAdHocTeamRegistrationCommand,
  WithdrawAdHocTeamRegistrationCommand,
  type AdHocRegistrationMemberInput,
} from '@pickupvb/application';
import {
  ConflictError,
  InvariantViolation,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { field, fieldOrNull } from '@/lib/form-data';
import { redirectEventNotice } from '@/lib/server-redirects';
import { requireRealUser } from '@/lib/server-auth';

function backWithError(eventId: string, code: string, msg?: string): never {
  redirectEventNotice(eventId, 'rsvp', code, msg);
}

function mapDomainErrorToCode(err: unknown): string | null {
  if (err instanceof UnauthorizedError) return 'team_forbidden';
  if (err instanceof NotFoundError) return 'event_not_found';
  if (err instanceof ConflictError) return 'team_division_dup';
  if (err instanceof ValidationError) return 'error';
  if (err instanceof InvariantViolation) {
    return 'error';
  }
  return null;
}

/**
 * Parses up to N member rows from a roster form. Each row is `member_N_*`
 * where N is the original sort_order — gaps allowed (we re-pack on the
 * domain side).
 */
function parseMembers(formData: FormData): AdHocRegistrationMemberInput[] {
  const out: AdHocRegistrationMemberInput[] = [];
  // Allow up to 24 slots (matches division.teamSize cap).
  for (let i = 0; i < 24; i += 1) {
    const name = fieldOrNull(formData, `member_${i}_name`);
    const email = fieldOrNull(formData, `member_${i}_email`);
    const userId = fieldOrNull(formData, `member_${i}_user_id`);
    if (!name && !email && !userId) continue;
    out.push({
      displayName: name,
      email,
      userId,
    });
  }
  return out;
}

export async function registerAdHocTeamFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(returnPath);
  const divisionId = field(formData, 'division_id');
  const name = field(formData, 'team_name');
  if (!divisionId) backWithError(eventId, 'team_division_required');
  if (!name) backWithError(eventId, 'team_name_required');

  const members = parseMembers(formData);

  try {
    await handlers.registerAdHocTeam.execute(
      new RegisterAdHocTeamCommand(eventId, divisionId, user.id, name, members),
    );
  } catch (err) {
    const code = mapDomainErrorToCode(err);
    if (code) backWithError(eventId, code);
    throw err;
  }

  revalidatePath(returnPath);
  updateTag(`event:${eventId}`);
  redirectEventNotice(eventId, 'rsvp', 'team_registered');
}

export async function renameAdHocTeamFromForm(
  eventId: string,
  registrationId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(returnPath);
  const name = field(formData, 'team_name');
  if (!name) backWithError(eventId, 'team_name_required');

  try {
    await handlers.renameAdHocTeamRegistration.execute(
      new RenameAdHocTeamRegistrationCommand(registrationId, user.id, name),
    );
  } catch (err) {
    const code = mapDomainErrorToCode(err);
    if (code) backWithError(eventId, code);
    throw err;
  }

  revalidatePath(returnPath);
  updateTag(`event:${eventId}`);
  redirectEventNotice(eventId, 'rsvp', 'team_updated');
}

export async function addAdHocTeamMemberFromForm(
  eventId: string,
  registrationId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(returnPath);
  const displayName = fieldOrNull(formData, 'member_name');
  const email = fieldOrNull(formData, 'member_email');
  const userId = fieldOrNull(formData, 'member_user_id');
  if (!displayName && !email && !userId) {
    backWithError(eventId, 'error', 'Enter a name or email for the new player.');
  }

  try {
    await handlers.addAdHocTeamMember.execute(
      new AddAdHocTeamMemberCommand(registrationId, user.id, {
        displayName,
        email,
        userId,
      }),
    );
  } catch (err) {
    const code = mapDomainErrorToCode(err);
    if (code) backWithError(eventId, code);
    throw err;
  }

  revalidatePath(returnPath);
  updateTag(`event:${eventId}`);
  redirectEventNotice(eventId, 'rsvp', 'team_updated');
}

export async function removeAdHocTeamMemberFromForm(
  eventId: string,
  registrationId: string,
  memberId: string,
  returnPath: string,
): Promise<void> {
  const { user } = await requireRealUser(returnPath);

  try {
    await handlers.removeAdHocTeamMember.execute(
      new RemoveAdHocTeamMemberCommand(registrationId, user.id, memberId),
    );
  } catch (err) {
    const code = mapDomainErrorToCode(err);
    if (code) backWithError(eventId, code);
    throw err;
  }

  revalidatePath(returnPath);
  updateTag(`event:${eventId}`);
  redirectEventNotice(eventId, 'rsvp', 'team_updated');
}

export async function withdrawAdHocTeamFromForm(
  eventId: string,
  registrationId: string,
  returnPath: string,
): Promise<void> {
  const { user } = await requireRealUser(returnPath);

  try {
    await handlers.withdrawAdHocTeamRegistration.execute(
      new WithdrawAdHocTeamRegistrationCommand(registrationId, user.id),
    );
  } catch (err) {
    if (err instanceof InvariantViolation) {
      backWithError(eventId, 'team_locked');
    }
    const code = mapDomainErrorToCode(err);
    if (code) backWithError(eventId, code);
    throw err;
  }

  revalidatePath(returnPath);
  updateTag(`event:${eventId}`);
  redirectEventNotice(eventId, 'rsvp', 'team_withdrawn');
}
