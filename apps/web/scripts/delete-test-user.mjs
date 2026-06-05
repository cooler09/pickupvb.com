/**
 * Delete a test/persona account from the dev Supabase project.
 *
 * Removes the `profiles` row (FK to auth.users) then the auth user. Dry-run by
 * default — pass `--apply` to actually delete. Refuses to touch an address that
 * doesn't look like a `+`-aliased test account unless `--force` is given, so a
 * fat-fingered real email can't be nuked.
 *
 *   node apps/web/scripts/delete-test-user.mjs zacharyjordan82+greg@gmail.com
 *   node apps/web/scripts/delete-test-user.mjs zacharyjordan82+greg@gmail.com --apply
 */
import { getAdmin, findUserByEmail, parseArgs } from './_admin.mjs';

const { positionals, flags } = parseArgs(process.argv.slice(2));
const email = positionals[0];
const apply = flags.has('apply') || flags.has('delete');

if (!email || !email.includes('@')) {
  console.error('Usage: node apps/web/scripts/delete-test-user.mjs <email> [--apply] [--force]');
  console.error('  Dry-run by default; pass --apply to delete.');
  process.exit(1);
}
if (!email.includes('+') && !flags.has('force')) {
  console.error(
    `Refusing: "${email}" is not a +aliased test address. Pass --force if you really mean it.`,
  );
  process.exit(1);
}

const { admin, host } = getAdmin();
console.log(`Project host : ${host}`);
console.log(`Mode         : ${apply ? '*** DELETE ***' : 'DRY RUN (read-only)'}`);
console.log(`Target email : ${email}`);

const user = await findUserByEmail(admin, email);
if (!user) {
  console.log('\nNo auth user with that email. Nothing to do.');
  process.exit(0);
}
const { data: prof } = await admin
  .from('profiles')
  .select('id, display_name, handle, deleted_at')
  .eq('id', user.id)
  .maybeSingle();
console.log('---');
console.log('  id           :', user.id);
console.log('  email        :', user.email);
console.log('  is_anonymous :', user.is_anonymous ?? false);
console.log('  created_at   :', user.created_at);
console.log('  profile      :', prof ? JSON.stringify(prof) : '(none)');

if (!apply) {
  console.log('\nDRY RUN — nothing deleted. Re-run with --apply to remove this user.');
  process.exit(0);
}

const { error: pErr } = await admin.from('profiles').delete().eq('id', user.id);
if (pErr) console.warn('  profile delete warning:', pErr.message);
const { error } = await admin.auth.admin.deleteUser(user.id);
if (error) {
  console.error('  FAILED to delete auth user:', error.message);
  process.exit(1);
}
console.log('  deleted auth user', user.email, user.id);
console.log('\nDone.');
