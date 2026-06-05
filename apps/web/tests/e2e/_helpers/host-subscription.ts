import { getCleanupClient, resolveUserIdByEmail } from './cleanup';

/**
 * Admin-client helpers for the subscription-lifecycle persona spec (Rachel P17 —
 * the lapsed Pro host). They mirror `apps/web/scripts/set-host-subscription.mjs`:
 * `is_pro_host` (the perk gate) is true for status in (trialing, active,
 * past_due) and false for (canceled, unpaid, …). So a test can flip a persona
 * between Pro and Free by writing `host_subscriptions.status`, assert the perk
 * gating, then RESTORE the original row so the shared dev account isn't left in
 * a surprising state for the next run.
 *
 * Plus two cap-arming fixtures: an active standalone bracket (the free-tier
 * "1 active bracket" cap) and a paid event with a paid division (the free-tier
 * "1 paid event / 30 days" cap — see `host_paid_event_count_30d`).
 *
 * All reuse the opt-in admin client from `cleanup.ts` (`E2E_CLEANUP_SUPABASE_*`);
 * when unset, `hostSubscriptionControlAvailable()` is false and the spec is a
 * sanctioned infra-gated skip.
 */

const RICHMOND_GEO = 'SRID=4326;POINT(-77.4360 37.5407)';
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function token(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++)
    s += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  return s;
}

// ── Subscription state ──────────────────────────────────────────────────────

/** Pro: trialing | active | past_due. Free/lapsed: canceled | unpaid | …. */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export interface SavedSubscription {
  userId: string;
  /** The pre-existing row's fields, or null when there was none. */
  previous: { status: string; cancel_at_period_end: boolean; plan: string | null } | null;
  /** True when this helper inserted a synthetic row (restore deletes it). */
  inserted: boolean;
}

/** True when the admin client is configured and the persona email is known. */
export function hostSubscriptionControlAvailable(email: string | undefined): boolean {
  return getCleanupClient() !== null && !!email;
}

/**
 * Set `host_subscriptions.status` for `email`, returning a {@link SavedSubscription}
 * so the caller can {@link restoreHostSubscription} afterwards. Updates the
 * existing row if present (preserving its `stripe_customer_id`), else inserts a
 * synthetic one — exactly like the `set-host-subscription.mjs` script.
 */
export async function setHostSubscriptionStatus(
  email: string,
  status: SubscriptionStatus,
): Promise<SavedSubscription> {
  const admin = getCleanupClient();
  if (!admin) throw new Error('setHostSubscriptionStatus: admin client unavailable.');
  const userId = await resolveUserIdByEmail(email);

  const { data: existing } = await admin
    .from('host_subscriptions')
    .select('status, cancel_at_period_end, plan')
    .eq('user_id', userId)
    .maybeSingle();

  const saved: SavedSubscription = {
    userId,
    previous: existing
      ? {
          status: existing.status,
          cancel_at_period_end: existing.cancel_at_period_end,
          plan: existing.plan,
        }
      : null,
    inserted: !existing,
  };

  const now = new Date().toISOString();
  if (existing) {
    const { error } = await admin
      .from('host_subscriptions')
      .update({ status, cancel_at_period_end: status === 'canceled', updated_at: now })
      .eq('user_id', userId);
    if (error) throw new Error(`setHostSubscriptionStatus update failed: ${error.message}`);
  } else {
    const { error } = await admin.from('host_subscriptions').insert({
      user_id: userId,
      status,
      stripe_customer_id: `cus_e2e_${userId.slice(0, 8)}`,
      cancel_at_period_end: status === 'canceled',
    });
    if (error) throw new Error(`setHostSubscriptionStatus insert failed: ${error.message}`);
  }
  return saved;
}

/** Put the subscription row back the way {@link setHostSubscriptionStatus} found it. */
export async function restoreHostSubscription(saved: SavedSubscription | null): Promise<void> {
  if (!saved) return;
  const admin = getCleanupClient();
  if (!admin) return;
  if (saved.inserted) {
    await admin.from('host_subscriptions').delete().eq('user_id', saved.userId);
  } else if (saved.previous) {
    await admin
      .from('host_subscriptions')
      .update({
        status: saved.previous.status,
        cancel_at_period_end: saved.previous.cancel_at_period_end,
        plan: saved.previous.plan,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', saved.userId);
  }
}

// ── Cap-arming fixtures ─────────────────────────────────────────────────────

/**
 * Insert an active (non-`completed`) standalone bracket owned by `ownerEmail` so
 * the free-tier "1 active standalone bracket" cap is armed. Returns the bracket
 * id; pair with {@link deleteArmedBracket}.
 */
export async function armStandaloneBracket(ownerEmail: string): Promise<string> {
  const admin = getCleanupClient();
  if (!admin) throw new Error('armStandaloneBracket: admin client unavailable.');
  const ownerId = await resolveUserIdByEmail(ownerEmail);
  const { data, error } = await admin
    .from('event_brackets')
    .insert({ owner_user_id: ownerId, format: 'single_elimination', status: 'draft' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`armStandaloneBracket insert failed: ${error?.message}`);
  return data.id;
}

export async function deleteArmedBracket(bracketId: string | null): Promise<void> {
  if (!bracketId) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('event_brackets').delete().eq('id', bracketId);
}

/**
 * Insert a paid event (one division with `price_cents > 0`) hosted by
 * `hostEmail` and created just now, so the free-tier "1 paid event / 30 days"
 * cap is armed. Pass `status: 'cancelled'` for the abuse-guard scenario — the
 * cap count is status-agnostic, so a cancelled paid event must still occupy the
 * slot. (Note `events.status` uses the British 'cancelled', unlike
 * `host_subscriptions.status` = 'canceled'.) Returns the event id; pair with
 * {@link deleteArmedPaidEvent} (CASCADEs the division).
 */
export async function armPaidEvent(
  hostEmail: string,
  opts: { status?: 'published' | 'cancelled' } = {},
): Promise<string> {
  const admin = getCleanupClient();
  if (!admin) throw new Error('armPaidEvent: admin client unavailable.');
  const hostId = await resolveUserIdByEmail(hostEmail);
  const now = Date.now();

  const { data: ev, error: evErr } = await admin
    .from('events')
    .insert({
      host_id: hostId,
      title: `E2E Cap Arm ${token(4)}`,
      description: 'E2E paid-cap arming fixture — provisioned by _helpers/host-subscription.ts.',
      surface: 'indoor',
      type: 'open_play',
      visibility: 'public',
      status: opts.status ?? 'published',
      address_line: '500 E Marshall St',
      city: 'Richmond',
      region: 'VA',
      postal_code: '23219',
      country: 'US',
      geo: RICHMOND_GEO,
      starts_at: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(now + 5 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
      short_code: `E2P${token(3)}`,
      time_zone: 'America/New_York',
    })
    .select('id')
    .single();
  if (evErr || !ev) throw new Error(`armPaidEvent event insert failed: ${evErr?.message}`);

  const { error: divErr } = await admin.from('event_divisions').insert({
    event_id: ev.id,
    sort_order: 0,
    label: 'Open',
    surface: 'indoor',
    format: 'sixes',
    gender: 'coed',
    skill_tier: 'bb',
    team_composition: 'solo',
    capacity_kind: 'unlimited',
    price_cents: 1500,
  });
  if (divErr) {
    await admin.from('events').delete().eq('id', ev.id);
    throw new Error(`armPaidEvent division insert failed: ${divErr.message}`);
  }
  return ev.id;
}

export async function deleteArmedPaidEvent(eventId: string | null): Promise<void> {
  if (!eventId) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('events').delete().eq('id', eventId);
}
