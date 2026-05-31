'use server';

/**
 * Server actions for walk-in team registrations (ADR 0017).
 *
 * The host registers a team that showed up on tournament day without a
 * pre-registered captain account, then marks it paid in cash. Each
 * `*FromForm` is a thin FormData adapter around an application handler.
 * Bind the path-specific args at the call site:
 *
 *   <form action={registerWalkInTeamFromForm.bind(null, eventId, returnPath)}>
 *
 * Outcomes are surfaced via `?rsvp=<code>` query params resolved by
 * [event-rsvp-flash.ts](apps/web/src/lib/event-rsvp-flash.ts).
 */

import { revalidatePath, updateTag } from 'next/cache';
import { eventCacheTag } from '@/lib/cache-tags';
import {
  MarkWalkInPaidCashCommand,
  RegisterWalkInTeamCommand,
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
  if (err instanceof InvariantViolation) return 'error';
  return null;
}

/**
 * Parses additional roster members from a textarea (one name per line).
 * Walk-in entry is intentionally cheap to fill out at the score table —
 * a textarea is faster than a repeating sub-form. Captain identity is
 * captured separately (`captain_display_name`, `captain_phone`) because
 * the captain row anchors the registration.
 */
function parseMembersFromTextarea(formData: FormData): AdHocRegistrationMemberInput[] {
  const raw = fieldOrNull(formData, 'members');
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 23) // captain + 23 extras = 24-slot ceiling matches division.teamSize cap
    .map((displayName) => ({ displayName, email: null, userId: null }));
}

export async function registerWalkInTeamFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(returnPath);
  const divisionId = field(formData, 'division_id');
  const name = field(formData, 'team_name');
  const captainDisplayName = field(formData, 'captain_display_name');
  const captainPhone = fieldOrNull(formData, 'captain_phone');
  if (!divisionId) backWithError(eventId, 'team_division_required');
  if (!name) backWithError(eventId, 'team_name_required');
  if (!captainDisplayName) backWithError(eventId, 'team_name_required');

  const members = parseMembersFromTextarea(formData);

  try {
    await handlers.registerWalkInTeam.execute(
      new RegisterWalkInTeamCommand(
        eventId,
        divisionId,
        user.id,
        name,
        captainDisplayName,
        captainPhone,
        members,
      ),
    );
  } catch (err) {
    const code = mapDomainErrorToCode(err);
    if (code) backWithError(eventId, code);
    throw err;
  }

  revalidatePath(returnPath);
  updateTag(eventCacheTag(eventId));
  redirectEventNotice(eventId, 'rsvp', 'team_registered');
}

export async function markWalkInPaidCashFromForm(
  eventId: string,
  registrationId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(returnPath);
  const note = fieldOrNull(formData, 'note');

  try {
    await handlers.markWalkInPaidCash.execute(
      new MarkWalkInPaidCashCommand(registrationId, user.id, note),
    );
  } catch (err) {
    const code = mapDomainErrorToCode(err);
    if (code) backWithError(eventId, code);
    throw err;
  }

  revalidatePath(returnPath);
  updateTag(eventCacheTag(eventId));
  redirectEventNotice(eventId, 'rsvp', 'team_marked_paid');
}
