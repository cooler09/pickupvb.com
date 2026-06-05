/**
 * Set a host's Pro subscription state in the dev Supabase project, so a persona
 * can reflect a given point in the subscription lifecycle (docs/personas.md —
 * Rachel Kim P17 "lapsed Pro", Mark P1 "active", etc.).
 *
 * `is_pro_host` (the perk gate) is true only for status in
 * (trialing, active, past_due). So:
 *   - trialing | active            → Pro
 *   - past_due                     → Pro (grace window)
 *   - canceled | unpaid | …        → lapsed / Free
 *
 * Updates the existing `host_subscriptions` row if present (keeping the real
 * stripe_customer_id), else inserts a synthetic one. Dry-run by default — pass
 * `--apply` to write. The account must already exist (sign in once) because the
 * row FKs to profiles(id).
 *
 *   node apps/web/scripts/set-host-subscription.mjs <email> canceled --apply
 *   node apps/web/scripts/set-host-subscription.mjs <email> active --plan yearly --apply
 *
 * ⚠️ This only changes the DB. If the host has a live Stripe subscription, a
 * later webhook can re-sync and overwrite this — cancel in Stripe too for a
 * permanent change.
 */
import { getAdmin, findUserByEmail, parseArgs } from './_admin.mjs';

const VALID = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
];
const PRO = new Set(['trialing', 'active', 'past_due']);

// Pull `--plan <value>` out before the generic parse (it's a valued flag).
const raw = process.argv.slice(2);
const planIdx = raw.indexOf('--plan');
let plan = null;
let rest = raw;
if (planIdx !== -1) {
  plan = raw[planIdx + 1] ?? null;
  rest = raw.filter((_, i) => i !== planIdx && i !== planIdx + 1);
}
const { positionals, flags } = parseArgs(rest);
const [email, status] = positionals;
const apply = flags.has('apply');

if (!email || !email.includes('@') || !status) {
  console.error(
    'Usage: node apps/web/scripts/set-host-subscription.mjs <email> <status> [--plan monthly|yearly] [--apply]',
  );
  console.error(`  status one of: ${VALID.join(', ')}`);
  console.error('  Pro: trialing|active|past_due.  Lapsed/Free: canceled (+ unpaid, …).');
  console.error('  Dry-run by default; pass --apply to write.');
  process.exit(1);
}
if (!VALID.includes(status)) {
  console.error(`Invalid status "${status}". One of: ${VALID.join(', ')}`);
  process.exit(1);
}
if (plan && !['monthly', 'yearly'].includes(plan)) {
  console.error(`Invalid --plan "${plan}". Use monthly or yearly.`);
  process.exit(1);
}

const { admin, host } = getAdmin();
console.log(`Project host : ${host}`);
console.log(`Mode         : ${apply ? '*** WRITE ***' : 'DRY RUN (read-only)'}`);
console.log(`Target       : ${email} → status='${status}'${plan ? ` plan='${plan}'` : ''}`);
console.log(`is_pro_host  : will be ${PRO.has(status)}`);

const user = await findUserByEmail(admin, email);
if (!user) {
  console.error(
    `\nNo auth user for ${email}. Sign in once as them first (creates auth.users + profile, ` +
      `which the host_subscriptions FK needs).`,
  );
  process.exit(1);
}

const { data: existing } = await admin
  .from('host_subscriptions')
  .select('user_id, status, plan, stripe_customer_id, current_period_end, cancel_at_period_end')
  .eq('user_id', user.id)
  .maybeSingle();
console.log('current row  :', existing ? JSON.stringify(existing) : '(none)');

if (!apply) {
  const { data: proNow } = await admin.rpc('is_pro_host', { p_user_id: user.id });
  console.log('is_pro_host now:', proNow);
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  process.exit(0);
}

const now = new Date().toISOString();
let error;
if (existing) {
  ({ error } = await admin
    .from('host_subscriptions')
    .update({
      status,
      cancel_at_period_end: status === 'canceled',
      updated_at: now,
      ...(plan ? { plan } : {}),
    })
    .eq('user_id', user.id));
} else {
  ({ error } = await admin.from('host_subscriptions').insert({
    user_id: user.id,
    status,
    stripe_customer_id: `cus_e2e_${user.id.slice(0, 8)}`,
    cancel_at_period_end: status === 'canceled',
    plan: plan ?? null,
  }));
}
if (error) {
  console.error('  write FAILED:', error.message);
  process.exit(1);
}

const { data: proAfter } = await admin.rpc('is_pro_host', { p_user_id: user.id });
console.log(`  wrote host_subscriptions; is_pro_host now: ${proAfter}`);
console.log('\nDone.');
