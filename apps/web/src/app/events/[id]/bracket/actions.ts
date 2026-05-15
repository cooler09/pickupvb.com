'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
    CreateBracketCommand,
    GenerateBracketCommand,
    RecordMatchResultCommand,
    ResetBracketCommand,
    ResetMatchCommand,
    SeedBracketCommand,
} from '@pickupvb/application';
import {
    ConflictError,
    InvariantViolation,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
    type BracketFormat,
    type MatchSet,
} from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';

/**
 * Server actions for the bracket page. Host-only mutations (create, seed,
 * generate, reset, reset-match) are guarded inside the handler. Result
 * recording is permitted for hosts/co-hosts and either team's captain;
 * RLS at the DB layer is the second line of defense.
 *
 * All actions redirect back to `/events/[id]/bracket?notice=...` so the
 * page can flash a small status banner on the next render.
 */

const path = (eventId: string) => `/events/${eventId}/bracket` as const;

function back(eventId: string, notice: string, msg?: string): never {
    const params = new URLSearchParams({ notice });
    if (msg) params.set('msg', msg);
    redirect(`${path(eventId)}?${params.toString()}`);
}

function classify(err: unknown): { code: string; msg: string } {
    if (err instanceof UnauthorizedError) return { code: 'forbidden', msg: err.message };
    if (err instanceof ConflictError) return { code: 'conflict', msg: err.message };
    if (err instanceof NotFoundError) return { code: 'notfound', msg: err.message };
    if (err instanceof InvariantViolation) return { code: 'invalid', msg: err.message };
    if (err instanceof ValidationError) return { code: 'invalid', msg: err.message };
    return { code: 'error', msg: err instanceof Error ? err.message : String(err) };
}

export async function createBracket(
    eventId: string,
    format: BracketFormat,
): Promise<void> {
    const { user } = await requireRealUser();
    try {
        await handlers.createBracket.execute(
            new CreateBracketCommand(eventId, user.id, format),
        );
    } catch (err) {
        const { code, msg } = classify(err);
        revalidatePath(path(eventId));
        back(eventId, code, msg);
    }
    revalidatePath(path(eventId));
    back(eventId, 'created');
}

/** Bound at the call site: `createBracketFromForm.bind(null, eventId)`. */
export async function createBracketFromForm(
    eventId: string,
    formData: FormData,
): Promise<void> {
    const format = String(formData.get('format') ?? 'single_elimination') as BracketFormat;
    await createBracket(eventId, format);
}

/**
 * Reseed: the form posts hidden `team_id` inputs in the desired order.
 */
export async function seedBracketFromForm(
    eventId: string,
    formData: FormData,
): Promise<void> {
    const { user } = await requireRealUser();
    const teamIds = formData
        .getAll('team_id')
        .map((v) => String(v))
        .filter((v) => v.length > 0);
    try {
        await handlers.seedBracket.execute(
            new SeedBracketCommand(eventId, user.id, teamIds),
        );
    } catch (err) {
        const { code, msg } = classify(err);
        revalidatePath(path(eventId));
        back(eventId, code, msg);
    }
    revalidatePath(path(eventId));
    back(eventId, 'seeded');
}

/**
 * Same as `seedBracketFromForm` but shuffles the team order before saving.
 * Lets the host hit a single button to randomize seeding.
 */
export async function randomizeSeedFromForm(
    eventId: string,
    formData: FormData,
): Promise<void> {
    const ids = formData.getAll('team_id').map((v) => String(v));
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const a = ids[i] as string;
        const b = ids[j] as string;
        ids[i] = b;
        ids[j] = a;
    }
    const out = new FormData();
    for (const id of ids) out.append('team_id', id);
    await seedBracketFromForm(eventId, out);
}

export async function generateBracket(eventId: string): Promise<void> {
    const { user } = await requireRealUser();
    try {
        await handlers.generateBracket.execute(
            new GenerateBracketCommand(eventId, user.id),
        );
    } catch (err) {
        const { code, msg } = classify(err);
        revalidatePath(path(eventId));
        back(eventId, code, msg);
    }
    revalidatePath(path(eventId));
    back(eventId, 'generated');
}

export async function resetBracket(eventId: string): Promise<void> {
    const { user } = await requireRealUser();
    try {
        await handlers.resetBracket.execute(
            new ResetBracketCommand(eventId, user.id),
        );
    } catch (err) {
        const { code, msg } = classify(err);
        revalidatePath(path(eventId));
        back(eventId, code, msg);
    }
    revalidatePath(path(eventId));
    back(eventId, 'reset');
}

/**
 * Result entry. The form encodes set scores as paired `set_a_<n>` /
 * `set_b_<n>` fields starting at 1; empty pairs are dropped. Any pair
 * with one side filled but not the other is rejected as invalid.
 */
export async function recordMatchResultFromForm(
    eventId: string,
    matchId: string,
    formData: FormData,
): Promise<void> {
    await requireRealUser();
    const sets: MatchSet[] = [];
    let n = 1;
    while (true) {
        const a = formData.get(`set_a_${n}`);
        const b = formData.get(`set_b_${n}`);
        if (a === null && b === null) break;
        const aStr = String(a ?? '').trim();
        const bStr = String(b ?? '').trim();
        if (aStr === '' && bStr === '') {
            n += 1;
            continue;
        }
        const aNum = Number(aStr);
        const bNum = Number(bStr);
        if (!Number.isFinite(aNum) || !Number.isFinite(bNum) || aNum < 0 || bNum < 0) {
            back(eventId, 'invalid', `Set ${n} scores must be non-negative numbers.`);
        }
        sets.push({ setNumber: sets.length + 1, teamAScore: aNum, teamBScore: bNum });
        n += 1;
    }
    try {
        await handlers.recordMatchResult.execute(
            new RecordMatchResultCommand(eventId, matchId, '', sets),
        );
    } catch (err) {
        const { code, msg } = classify(err);
        revalidatePath(path(eventId));
        back(eventId, code, msg);
    }
    revalidatePath(path(eventId));
    revalidatePath(`/events/${eventId}`);
    back(eventId, 'result_saved');
}

export async function resetMatch(eventId: string, matchId: string): Promise<void> {
    await requireRealUser();
    try {
        await handlers.resetMatch.execute(
            new ResetMatchCommand(eventId, matchId, ''),
        );
    } catch (err) {
        const { code, msg } = classify(err);
        revalidatePath(path(eventId));
        back(eventId, code, msg);
    }
    revalidatePath(path(eventId));
    back(eventId, 'match_reset');
}
