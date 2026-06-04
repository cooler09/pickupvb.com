/**
 * Run the Playwright e2e suite against dev with the proper env wired up.
 *
 * Playwright does NOT auto-load apps/web/.env.local, and `source`-ing it from a
 * shell is fragile (multi-line/quoted values like PEM/VAPID keys break it). So
 * this runner loads .env.local with the same robust line-by-line parser the
 * admin scripts use, maps the cleanup creds, defaults the target to dev, and
 * spawns `playwright test` with that environment. Any extra args pass straight
 * through to Playwright.
 *
 *   node apps/web/scripts/run-e2e.mjs persona-           # just the persona specs
 *   node apps/web/scripts/run-e2e.mjs                    # whole suite
 *   node apps/web/scripts/run-e2e.mjs --grep-invert @destructive
 *   node apps/web/scripts/run-e2e.mjs persona-mark --reporter=line
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnvLocal } from './_admin.mjs';

loadEnvLocal();

// Cleanup creds drive per-spec hard-delete + the globalTeardown sweep. The
// helper reads E2E_CLEANUP_SUPABASE_* specifically (it does NOT fall back to
// SUPABASE_*), so map them from the app creds when not set explicitly.
if (!process.env.E2E_CLEANUP_SUPABASE_URL && process.env.SUPABASE_URL) {
  process.env.E2E_CLEANUP_SUPABASE_URL = process.env.SUPABASE_URL;
}
if (!process.env.E2E_CLEANUP_SUPABASE_SECRET_KEY && process.env.SUPABASE_SECRET_KEY) {
  process.env.E2E_CLEANUP_SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
}

// Never silently fall through to localhost (which auto-starts `pnpm dev` and is
// Turnstile-bound to dev, so sign-in fails). Default to the dev origin.
if (!process.env.PLAYWRIGHT_BASE_URL) {
  process.env.PLAYWRIGHT_BASE_URL = 'https://dev.pickupvb.com';
}

const appsWeb = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const passthrough = process.argv.slice(2);

const emails = Object.keys(process.env).filter((k) => /^TEST_.*EMAIL$/.test(k)).length;
console.log('[run-e2e] base URL        :', process.env.PLAYWRIGHT_BASE_URL);
console.log('[run-e2e] TEST_*_EMAIL set :', emails);
console.log('[run-e2e] password set     :', Boolean(process.env.TEST_USER_PASSWORD));
console.log(
  '[run-e2e] cleanup          :',
  process.env.E2E_CLEANUP_SUPABASE_URL
    ? new URL(process.env.E2E_CLEANUP_SUPABASE_URL).host
    : '(disabled — fixtures will leak / teardown no-op)',
);
console.log('[run-e2e] playwright args  :', passthrough.join(' ') || '(whole suite)');

const child = spawn('pnpm', ['exec', 'playwright', 'test', ...passthrough], {
  cwd: appsWeb,
  env: process.env,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error('[run-e2e] failed to spawn playwright:', err.message);
  process.exit(1);
});
