/**
 * Pure, Supabase-free aggregation + classification helpers for the host
 * dashboard (`/host`). Kept in their own module so they're unit-testable in
 * isolation (see `aggregate.test.ts`) without mocking the database — the loader
 * (`load-host-dashboard.ts`) does the I/O and hands raw rows to these.
 *
 * Everything here is deterministic given its inputs: any "now" is passed in as
 * `nowMs` rather than read from the clock, so the functions stay pure and the
 * tests don't flake on the wall clock (also React Compiler rule #4 — no impure
 * reads).
 */

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Narrow payment-audit row — the columns the dashboard reads. */
export type AuditRow = { action: string; amount_cents: number; occurred_at: string };

/** One bar in the revenue chart: net cents (paid − refunded) for a UTC month. */
export type MonthlyNet = { key: string; label: string; net: number };

/** Build the `YYYY-MM` key + short `Mon 'YY` label for a UTC month. */
function monthKeyLabel(year: number, month1: number): { key: string; label: string } {
  const key = `${year}-${String(month1).padStart(2, '0')}`;
  const label = `${MONTH_LABELS[month1 - 1]} '${String(year).slice(2)}`;
  return { key, label };
}

/**
 * Roll payment-audit rows into trailing monthly **net** (paid − refunded),
 * ordered oldest → newest (left-to-right for the chart), capped to the most
 * recent `months`. Months with no transactions inside the covered span are
 * filled with a zero bar so the axis reads continuously.
 */
export function monthlyNet(rows: ReadonlyArray<AuditRow>, nowMs: number, months = 6): MonthlyNet[] {
  const netByKey = new Map<string, number>();
  for (const row of rows) {
    const d = new Date(row.occurred_at);
    const { key } = monthKeyLabel(d.getUTCFullYear(), d.getUTCMonth() + 1);
    const delta = row.action === 'paid' ? row.amount_cents : -row.amount_cents;
    netByKey.set(key, (netByKey.get(key) ?? 0) + delta);
  }

  // Emit a continuous window of the last `months` UTC months ending at `nowMs`.
  const now = new Date(nowMs);
  const out: MonthlyNet[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const { key, label } = monthKeyLabel(d.getUTCFullYear(), d.getUTCMonth() + 1);
    out.push({ key, label, net: netByKey.get(key) ?? 0 });
  }
  return out;
}

/**
 * Sum each event's current signup count into the UTC month it takes place,
 * across a window of `monthsBack` past months through `monthsFwd` future months
 * (inclusive of the current month). Unlike revenue (which is historical), this
 * leans on `attendee_count` so **upcoming** events show their demand — a host
 * wants to see the next two months filling, not just what already happened.
 */
export function monthlySignups(
  events: ReadonlyArray<Pick<EventLike, 'starts_at' | 'attendee_count'>>,
  nowMs: number,
  monthsBack = 3,
  monthsFwd = 2,
): MonthlyNet[] {
  const byKey = new Map<string, number>();
  for (const e of events) {
    const d = new Date(e.starts_at);
    const { key } = monthKeyLabel(d.getUTCFullYear(), d.getUTCMonth() + 1);
    byKey.set(key, (byKey.get(key) ?? 0) + e.attendee_count);
  }

  const now = new Date(nowMs);
  const out: MonthlyNet[] = [];
  for (let offset = -monthsBack; offset <= monthsFwd; offset++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const { key, label } = monthKeyLabel(d.getUTCFullYear(), d.getUTCMonth() + 1);
    out.push({ key, label, net: byKey.get(key) ?? 0 });
  }
  return out;
}

/** All-time gross / refunds / net from narrow audit rows. */
export function revenueTotals(rows: ReadonlyArray<{ action: string; amount_cents: number }>): {
  grossCents: number;
  refundedCents: number;
  netCents: number;
} {
  let grossCents = 0;
  let refundedCents = 0;
  for (const r of rows) {
    if (r.action === 'paid') grossCents += r.amount_cents;
    else if (r.action === 'refunded') refundedCents += r.amount_cents;
  }
  return { grossCents, refundedCents, netCents: grossCents - refundedCents };
}

/** Structural subset of a hosted-event row the aggregates need. */
export type EventLike = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  capacity_kind: string | null;
  max_spots: number | null;
  attendee_count: number;
};

/** True for a fixed-capacity event with a known spot count. */
function hasCapacity(e: Pick<EventLike, 'capacity_kind' | 'max_spots'>): boolean {
  return e.capacity_kind === 'fixed' && e.max_spots !== null && e.max_spots > 0;
}

/**
 * Aggregate fill rate (signed-up ÷ capacity) across the given events, counting
 * only fixed-capacity events. Returns `null` when none have capacity set, so the
 * caller can render "n/a" rather than a misleading 0%.
 */
export function fillRate(events: ReadonlyArray<EventLike>): number | null {
  let signed = 0;
  let capacity = 0;
  for (const e of events) {
    if (!hasCapacity(e)) continue;
    signed += e.attendee_count;
    capacity += e.max_spots ?? 0;
  }
  return capacity > 0 ? signed / capacity : null;
}

export type AttentionKind = 'draft' | 'full' | 'starting_soon';

/** One row in the "needs attention" action list. The component maps `kind` to a
 *  CTA + href (`/events/[id]/manage` or `/edit`). */
export type AttentionItem = {
  id: string;
  title: string;
  kind: AttentionKind;
  startsAt: string;
  attendeeCount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_WINDOW_DAYS = 7;

/** A non-published, non-cancelled event is a draft the host hasn't shipped. */
function isDraft(status: string): boolean {
  return status !== 'published' && status !== 'cancelled';
}

/**
 * Classify the events that need the host's attention *now*, at most one item per
 * event (most actionable first). Pure given `nowMs`:
 *
 * - **draft** — unshipped (not published/cancelled), still upcoming → publish it.
 * - **full** — published, upcoming, fixed-capacity and at/over capacity → likely
 *   has a waitlist to manage.
 * - **starting_soon** — published, upcoming, starts within 7 days.
 *
 * Returned sorted soonest-first and capped to `limit`.
 */
export function needsAttention(
  events: ReadonlyArray<EventLike>,
  nowMs: number,
  limit = 6,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const e of events) {
    const startMs = new Date(e.starts_at).getTime();
    const upcoming = startMs >= nowMs;

    let kind: AttentionKind | null = null;
    if (isDraft(e.status)) {
      if (upcoming) kind = 'draft';
    } else if (e.status === 'published' && upcoming) {
      if (hasCapacity(e) && e.attendee_count >= (e.max_spots ?? 0)) {
        kind = 'full';
      } else if (startMs - nowMs <= SOON_WINDOW_DAYS * DAY_MS) {
        kind = 'starting_soon';
      }
    }

    if (kind) {
      items.push({
        id: e.id,
        title: e.title,
        kind,
        startsAt: e.starts_at,
        attendeeCount: e.attendee_count,
      });
    }
  }

  items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return items.slice(0, limit);
}
