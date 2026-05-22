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
import { sendWebPush, type WebPushPayload } from '@/lib/web-push';
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

type PushSub = { endpoint: string; p256dh: string; auth: string };

async function processRow(
    admin: ReturnType<typeof createSupabaseAdminClient>,
    row: OutboxRow,
    pushSubsByUser: Map<string, PushSub[]>,
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

    // push: fan out to every subscription this user has. We deliver each one
    // and prune endpoints that 404/410 (subscription gone). Row marked sent
    // as long as ANY delivery succeeded; if all fail with non-gone errors,
    // we throw to trigger the outer retry/backoff. `to_address` is the
    // user_id for push rows (set in lib/notify.ts).
    //
    // Subscriptions are pre-fetched once per batch by the GET handler — see
    // performance audit P2 #7. If 30 outbox rows target the same user we'd
    // otherwise issue 30 identical lookups against `push_subscriptions`.
    const list = pushSubsByUser.get(row.to_address) ?? [];
    const payload = row.payload as unknown as WebPushPayload;

    if (list.length === 0) {
        await admin
            .from('notification_outbox')
            .update({
                status: 'skipped',
                last_error: 'no-push-subscriptions',
            } as never)
            .eq('id', row.id);
        return;
    }

    // Fan out in parallel — per-device latency adds up fast when a user has
    // several subscriptions. allSettled so one failure doesn't drop the rest.
    const results = await Promise.allSettled(
        list.map((sub) => sendWebPush(sub, payload)),
    );
    let anyOk = false;
    const gone: string[] = [];
    const errors: string[] = [];
    for (let i = 0; i < results.length; i++) {
        const settled = results[i]!;
        const sub = list[i]!;
        if (settled.status === 'rejected') {
            errors.push(`threw:${String(settled.reason).slice(0, 80)}`);
            continue;
        }
        const result = settled.value;
        if (result.ok) {
            anyOk = true;
        } else if (result.gone) {
            gone.push(sub.endpoint);
        } else {
            errors.push(`${result.statusCode}:${result.message}`);
        }
    }
    if (gone.length > 0) {
        await admin.from('push_subscriptions').delete().in('endpoint', gone);
    }
    if (anyOk) {
        await admin
            .from('notification_outbox')
            .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
            } as never)
            .eq('id', row.id);
        return;
    }
    if (errors.length === 0) {
        // Every subscription was gone — nothing to retry.
        await admin
            .from('notification_outbox')
            .update({
                status: 'skipped',
                last_error: 'all-subscriptions-gone',
            } as never)
            .eq('id', row.id);
        return;
    }
    throw new Error(`web-push-failed: ${errors.join('; ').slice(0, 400)}`);
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

    // Pre-fetch push subscriptions for the distinct set of users we're about
    // to deliver to (P2 #7 in performance.md). One query for the whole batch
    // instead of one per row; a user with N outbox rows costs 1 lookup, not N.
    const pushUserIds = Array.from(
        new Set(rows.filter((r) => r.channel === 'push').map((r) => r.to_address)),
    );
    const pushSubsByUser = new Map<string, PushSub[]>();
    if (pushUserIds.length > 0) {
        const { data: subRows } = await admin
            .from('push_subscriptions')
            .select('user_id, endpoint, p256dh, auth')
            .in('user_id', pushUserIds);
        const typed = (subRows as ({ user_id: string } & PushSub)[] | null) ?? [];
        for (const sub of typed) {
            const existing = pushSubsByUser.get(sub.user_id);
            const entry: PushSub = { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth };
            if (existing) existing.push(entry);
            else pushSubsByUser.set(sub.user_id, [entry]);
        }
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of rows) {
        try {
            await processRow(admin, row, pushSubsByUser);
            if (row.channel === 'email' || row.channel === 'push') sent += 1;
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
