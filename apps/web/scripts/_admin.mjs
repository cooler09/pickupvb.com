/**
 * Shared plumbing for the dev test-account admin scripts in this folder.
 *
 * These are operational CLIs (not app code) for provisioning / cleaning up the
 * persona test accounts (docs/personas.md) in the **dev** Supabase project.
 * They use the service-role key, so they bypass RLS — handle with care and
 * always eyeball the printed project host before passing `--apply`.
 *
 * Run from the repo root, e.g.:
 *   node apps/web/scripts/set-host-subscription.mjs <email> canceled --apply
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_LOCAL = path.join(HERE, '..', '.env.local'); // apps/web/.env.local

/** Load apps/web/.env.local into process.env without overriding existing vars. */
export function loadEnvLocal() {
  let txt;
  try {
    txt = readFileSync(ENV_LOCAL, 'utf8');
  } catch {
    return; // no .env.local — rely on the real environment
  }
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

/**
 * Build a service-role admin client + the project host string.
 *
 * Prefers the dedicated `E2E_CLEANUP_SUPABASE_*` vars (so you can deliberately
 * point at a throwaway project) and falls back to the app's `SUPABASE_*`.
 * Exits with a clear message if neither is configured.
 */
export function getAdmin() {
  loadEnvLocal();
  const url =
    process.env.E2E_CLEANUP_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.E2E_CLEANUP_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      'Missing Supabase admin creds. Set SUPABASE_URL + SUPABASE_SECRET_KEY (or\n' +
        'E2E_CLEANUP_SUPABASE_URL + E2E_CLEANUP_SUPABASE_SECRET_KEY) in apps/web/.env.local\n' +
        'or the environment.',
    );
    process.exit(1);
  }
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { admin, host: new URL(url).host };
}

/** Find an auth user by exact email (case-insensitive). Returns the user or null. */
export async function findUserByEmail(admin, email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Minimal arg parser: `--flag` → flags set; everything else → positionals. */
export function parseArgs(argv) {
  const positionals = [];
  const flags = new Set();
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a.slice(2));
    else positionals.push(a);
  }
  return { positionals, flags };
}
