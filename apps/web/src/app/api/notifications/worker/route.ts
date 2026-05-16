/**
 * Notification outbox worker. Pulls up to N pending rows, attempts
 * delivery via the appropriate channel adapter, and updates status.
 *
 * Called by Vercel Cron every minute (see vercel.json). Hardened with a
 * `CRON_SECRET` header — Vercel attaches `Authorization: Bearer <secret>`
 * automatically when `crons[].path` matches.
 *
 * Retry policy:
 *   - attempts < 5 → mark `failed`, reschedule for now+backoff
 *   - attempts >= 5 → leave `failed`, give up
 *   - exponential backoff: 1m, 5m, 25m, 2h, 6h
 *
 * SMS not wired yet — those rows stay `pending` and get logged.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { sendEmail } from '@/lib/email-resend';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH = 50;
const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [1, 5, 25, 120, 360] as const;

type OutboxRow = {
    id: string;
    channel: 'email' | 'sms' | 'push';
    kind: string;
    to_address: string;
    payload: Record<string, unknown>;
    attempts: number;
};

function isAuthorized(req: Request): boolean {
    const secret = process.env['CRON_SECRET'];
    if (!secret) return true; // unset in dev — allow
    const header = req.headers.get('authorization');
    return header === `Bearer ${secret}`;
}

async function processRow(
    admin: ReturnType<typeof createSupabaseAdminClient>,
    row: OutboxRow,
): Promise<void> {
    if (row.channel === 'email') {
        const p = row.payload as { subject: string; html: string; text: string };
        const result = await sendEmail({
            to: row.to_address,
            subject: p.subject,
            html: p.html,
            text: p.text,
        });
        await admin
            .from('notification_outbox')
            .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                provider_id: result.id,
            } as never)
            .eq('id', row.id);
        return;
    }

    if (row.channel === 'sms') {
        // Twilio adapter not wired yet. Mark skipped so we don't retry.
        await admin
            .from('notification_outbox')
            .update({
                status: 'skipped',
                last_error: 'sms-adapter-not-implemented',
            } as never)
            .eq('id', row.id);
        return;
    }

    // push: same story
    await admin
        .from('notification_outbox')
        .update({
            status: 'skipped',
            last_error: 'push-adapter-not-implemented',
        } as never)
        .eq('id', row.id);
}

export async function GET(req: Request): Promise<Response> {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // Claim a batch by flipping status pending → sending. This isn't a real
    // SKIP LOCKED — for the volumes we expect, the race is fine.
    const { data: claimed } = await admin
        .from('notification_outbox')
        .update({ status: 'sending' } as never)
        .eq('status', 'pending')
        .lte('scheduled_for', now)
        .select('id, channel, kind, to_address, payload, attempts')
        .limit(BATCH);

    const rows = (claimed as unknown as OutboxRow[] | null) ?? [];

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of rows) {
        try {
            await processRow(admin, row);
            if (row.channel === 'email') sent += 1;
            else skipped += 1;
        } catch (err) {
            failed += 1;
            const attempts = row.attempts + 1;
            const backoffMin = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] ?? 60;
            const nextAt = new Date(Date.now() + backoffMin * 60_000).toISOString();
            const giveUp = attempts >= MAX_ATTEMPTS;
            const patch: Record<string, unknown> = {
                status: giveUp ? 'failed' : 'pending',
                attempts,
                last_error: err instanceof Error ? err.message.slice(0, 500) : String(err),
            };
            if (!giveUp) patch['scheduled_for'] = nextAt;
            await admin
                .from('notification_outbox')
                .update(patch as never)
                .eq('id', row.id);
            await log.warn('[notif-worker] delivery failed', {
                id: row.id,
                channel: row.channel,
                attempts,
                giveUp,
            });
        }
    }

    return NextResponse.json({ claimed: rows.length, sent, failed, skipped });
}
