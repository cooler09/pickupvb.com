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
 * SMS not wired yet — those rows are marked `skipped`.
 *
 * DB access (claim / status updates / push-subscription reads + pruning) goes
 * through the `NotificationOutboxDrainPort` + `PushSubscriptionPort` (ADR 0022);
 * the delivery providers (Resend, Web Push) and the retry/backoff policy stay
 * here.
 */
import { NextResponse } from 'next/server';
import {
  SupabaseNotificationOutboxRepository,
  SupabasePushSubscriptionRepository,
} from '@pickupvb/infrastructure';
import type {
  NotificationOutboxDrainPort,
  OutboxRecord,
  PushSubscriptionPort,
  PushSubscriptionRecord,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import {
  KIND_CATEGORY,
  TRANSACTIONAL_CATEGORIES,
  type NotificationKind,
} from '@pickupvb/notifications';
import { sendEmail } from '@/lib/email-resend';
import { signUnsubscribeToken } from '@/lib/unsubscribe-token';
import { APP_URL } from '@/lib/app-url';
import { sendWebPush, type WebPushPayload } from '@/lib/web-push';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH = 50;
const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [1, 5, 25, 120, 360] as const;
// Drain the whole backlog per wake, but stop short of `maxDuration` (60s) so a
// large burst hands its remainder to the next wake / sweep instead of being
// killed mid-row. See ADR 0026 — the DB kick is debounced, so one wake must
// clear everything that's due, not just a single batch.
const DRAIN_BUDGET_MS = 50_000;

function isAuthorized(req: Request): boolean {
  const secret = process.env['CRON_SECRET'];
  if (!secret) return true; // unset in dev — allow
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

async function processRow(
  outbox: NotificationOutboxDrainPort,
  pushSubs: PushSubscriptionPort,
  row: OutboxRecord,
  pushSubsByUser: Map<string, PushSubscriptionRecord[]>,
): Promise<void> {
  if (row.channel === 'email') {
    const p = row.payload as { subject: string; html: string; text: string };
    // One-click List-Unsubscribe (RFC 8058) on non-transactional mail only —
    // you can't unsubscribe from a receipt/confirmation (CAN-SPAM). An unknown
    // kind has no category, so it's treated as non-transactional (gets a link).
    const category = KIND_CATEGORY[row.kind as NotificationKind];
    const token =
      category && TRANSACTIONAL_CATEGORIES.has(category) ? null : signUnsubscribeToken(row.userId);
    const listUnsubscribeUrl = token
      ? `${APP_URL}/api/unsubscribe?u=${encodeURIComponent(token)}`
      : undefined;
    const result = await sendEmail({
      to: row.toAddress,
      subject: p.subject,
      html: p.html,
      text: p.text,
      // Idempotency key so a redelivery after a crash between send and
      // markSent returns the original email, not a duplicate (TPI-8).
      idempotencyKey: row.id,
      ...(listUnsubscribeUrl ? { listUnsubscribeUrl } : {}),
    });
    await outbox.markSent(row.id, result.id);
    return;
  }

  if (row.channel === 'sms') {
    // Twilio adapter not wired yet. Mark skipped so we don't retry.
    await outbox.markSkipped(row.id, 'sms-adapter-not-implemented');
    return;
  }

  // push: fan out to every subscription this user has. We deliver each one
  // and prune endpoints that 404/410 (subscription gone). Row marked sent
  // as long as ANY delivery succeeded; if all fail with non-gone errors,
  // we throw to trigger the outer retry/backoff. `toAddress` is the user_id
  // for push rows (set in lib/notify.ts).
  //
  // Subscriptions are pre-fetched once per batch by the GET handler — see
  // performance audit P2 #7. If 30 outbox rows target the same user we'd
  // otherwise issue 30 identical lookups against `push_subscriptions`.
  const list = pushSubsByUser.get(row.toAddress) ?? [];
  const payload = row.payload as unknown as WebPushPayload;

  if (list.length === 0) {
    await outbox.markSkipped(row.id, 'no-push-subscriptions');
    return;
  }

  // Fan out in parallel — per-device latency adds up fast when a user has
  // several subscriptions. allSettled so one failure doesn't drop the rest.
  const results = await Promise.allSettled(list.map((sub) => sendWebPush(sub, payload)));
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
    await pushSubs.deleteByEndpoints(gone);
  }
  if (anyOk) {
    await outbox.markSent(row.id);
    return;
  }
  if (errors.length === 0) {
    // Every subscription was gone — nothing to retry.
    await outbox.markSkipped(row.id, 'all-subscriptions-gone');
    return;
  }
  throw new Error(`web-push-failed: ${errors.join('; ').slice(0, 400)}`);
}

type DrainCounts = { claimed: number; sent: number; failed: number; skipped: number };

/**
 * Claim and deliver one batch of due rows. `claimed` lets the caller tell
 * whether the queue may still hold more (a full batch ⇒ keep draining).
 */
async function drainOneBatch(
  outbox: NotificationOutboxDrainPort,
  pushSubs: PushSubscriptionPort,
): Promise<DrainCounts> {
  const rows = await outbox.claimBatch(BATCH);
  if (rows.length === 0) return { claimed: 0, sent: 0, failed: 0, skipped: 0 };

  // Pre-fetch push subscriptions for the distinct set of users we're about
  // to deliver to (P2 #7 in performance.md). One query for the whole batch
  // instead of one per row.
  const pushUserIds = Array.from(
    new Set(rows.filter((r) => r.channel === 'push').map((r) => r.toAddress)),
  );
  const pushSubsByUser = await pushSubs.listByUsers(pushUserIds);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      await processRow(outbox, pushSubs, row, pushSubsByUser);
      if (row.channel === 'email' || row.channel === 'push') sent += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      const attempts = row.attempts + 1;
      const backoffMin = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] ?? 60;
      const nextAt = new Date(Date.now() + backoffMin * 60_000).toISOString();
      const giveUp = attempts >= MAX_ATTEMPTS;
      await outbox.markFailed(row.id, {
        attempts,
        lastError: err instanceof Error ? err.message.slice(0, 500) : String(err),
        retryAt: giveUp ? null : nextAt,
      });
      await log.warn('[notif-worker] delivery failed', {
        id: row.id,
        channel: row.channel,
        attempts,
        giveUp,
      });
    }
  }

  return { claimed: rows.length, sent, failed, skipped };
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const outbox = new SupabaseNotificationOutboxRepository(admin);
  const pushSubs = new SupabasePushSubscriptionRepository(admin);

  // Drain the whole backlog, not just one batch — a single (debounced) kick
  // must deliver an entire broadcast burst, not leave the tail for the sweep
  // (ADR 0026). Bounded by DRAIN_BUDGET_MS so a very large backlog defers its
  // remainder to the next wake instead of timing out at `maxDuration`.
  const startedAt = Date.now();
  let claimed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let batches = 0;

  for (;;) {
    const r = await drainOneBatch(outbox, pushSubs);
    claimed += r.claimed;
    sent += r.sent;
    failed += r.failed;
    skipped += r.skipped;
    if (r.claimed > 0) batches += 1;
    if (r.claimed < BATCH) break; // queue drained
    if (Date.now() - startedAt > DRAIN_BUDGET_MS) break; // defer remainder to next wake
  }

  return NextResponse.json({ claimed, sent, failed, skipped, batches });
}
