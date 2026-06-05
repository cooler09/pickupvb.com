import fs from 'node:fs';
import path from 'node:path';
import { test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { withAuthContext } from './browser';
import { STORAGE_PATHS } from './paths';

/**
 * Persona registry — the e2e-facing half of docs/personas.md.
 *
 * Each persona maps to a real dev account (an env var + a storage-state file).
 * Six personas **adopt** the six pre-seeded accounts (Amy→attendee-a,
 * Adam→attendee-b, Julie→free-host, Mark→pro-host, Carlos→stripe-host,
 * Zoe→admin); their sign-in is owned by the original `auth.<role>.setup.ts`
 * projects, so `adoptsExistingSetup` is true and `auth.personas.setup.ts`
 * skips them. The rest get their own sign-in driven by the registry.
 *
 * Everything is **skip-graceful**: a persona whose `TEST_*_EMAIL` is unset
 * never gets a storage file, and `skipIfPersonaMissing` / `withPersona` skip
 * the dependent test with a message that names the missing env var. This is
 * the same contract as `skipIfMissingAuth` for the legacy role files — it lets
 * the persona suite land before all the dev accounts exist (the user is
 * provisioning them) without turning the run red.
 *
 * Greg (the anonymous → claimed guest) is deliberately NOT in this registry:
 * he has no pre-provisioned account. His flow is driven at runtime by
 * `persona-greg-anon.public.spec.ts`.
 */

export type PersonaKey =
  // hosts & organizers
  | 'mark'
  | 'julie'
  | 'steve'
  | 'diana'
  | 'sofia'
  | 'carlos'
  | 'nina'
  // players & attendees
  | 'amy'
  | 'adam'
  | 'bianca'
  | 'tyler'
  | 'priya'
  | 'marcus'
  | 'hannah'
  | 'olivia'
  // lifecycle & platform
  | 'rachel'
  | 'zoe';

export interface Persona {
  key: PersonaKey;
  /** Display name (matches docs/personas.md), used in test titles + skips. */
  name: string;
  /** docs/personas.md id, e.g. 'P3'. */
  id: string;
  /** One-line role, mirrors docs/personas.md. */
  role: string;
  /** The `TEST_*_EMAIL` env var that seeds this persona's dev account. */
  emailEnvVar: string;
  /** Storage-state file produced by a matching auth setup. */
  storagePath: string;
  /**
   * True when this persona reuses one of the six already-wired setup projects
   * rather than signing in via `auth.personas.setup.ts`. Keeps us from
   * signing the same account in twice.
   */
  adoptsExistingSetup: boolean;
}

export const PERSONAS: Record<PersonaKey, Persona> = {
  // ── Hosts & organizers ────────────────────────────────────────────────
  mark: {
    key: 'mark',
    name: 'Mark Delgado',
    id: 'P1',
    role: 'flagship Pro host (Pro + Stripe, owns VB Beach Club)',
    emailEnvVar: 'TEST_PRO_HOST_EMAIL',
    storagePath: STORAGE_PATHS.proHost,
    adoptsExistingSetup: true,
  },
  julie: {
    key: 'julie',
    name: 'Julie Tran',
    id: 'P2',
    role: 'free host who runs events as herself',
    emailEnvVar: 'TEST_FREE_HOST_EMAIL',
    storagePath: STORAGE_PATHS.freeHost,
    adoptsExistingSetup: true,
  },
  steve: {
    key: 'steve',
    name: 'Steve Park',
    id: 'P3',
    role: 'co-host / group admin (not the owner, no Stripe)',
    emailEnvVar: 'TEST_CO_HOST_EMAIL',
    storagePath: STORAGE_PATHS.steve,
    adoptsExistingSetup: false,
  },
  diana: {
    key: 'diana',
    name: 'Diana Wells',
    id: 'P4',
    role: 'league organizer (Pro + Stripe)',
    emailEnvVar: 'TEST_LEAGUE_HOST_EMAIL',
    storagePath: STORAGE_PATHS.diana,
    adoptsExistingSetup: false,
  },
  sofia: {
    key: 'sofia',
    name: 'Sofia Reyes',
    id: 'P5',
    role: 'tournament director (Pro + Stripe, all bracket formats)',
    emailEnvVar: 'TEST_TOURNEY_HOST_EMAIL',
    storagePath: STORAGE_PATHS.sofia,
    adoptsExistingSetup: false,
  },
  carlos: {
    key: 'carlos',
    name: 'Carlos Mendez',
    id: 'P6',
    role: 'Stripe-onboarded but free tier (owns The Sandbar Courts)',
    emailEnvVar: 'TEST_STRIPE_HOST_EMAIL',
    storagePath: STORAGE_PATHS.stripeHost,
    adoptsExistingSetup: true,
  },
  nina: {
    key: 'nina',
    name: 'Nina Okafor',
    id: 'P7',
    role: 'new host who has not connected Stripe yet',
    emailEnvVar: 'TEST_NEW_HOST_EMAIL',
    storagePath: STORAGE_PATHS.nina,
    adoptsExistingSetup: false,
  },

  // ── Players & attendees ───────────────────────────────────────────────
  amy: {
    key: 'amy',
    name: 'Amy Cho',
    id: 'P8',
    role: 'casual open-play regular (primary authed user)',
    emailEnvVar: 'TEST_USER_EMAIL',
    storagePath: STORAGE_PATHS.attendeeA,
    adoptsExistingSetup: true,
  },
  adam: {
    key: 'adam',
    name: 'Adam Russo',
    id: 'P9',
    role: 'competitive captain (second multi-actor account)',
    emailEnvVar: 'TEST_ATTENDEE_B_EMAIL',
    storagePath: STORAGE_PATHS.attendeeB,
    adoptsExistingSetup: true,
  },
  bianca: {
    key: 'bianca',
    name: 'Bianca Flores',
    id: 'P10',
    role: 'team captain (Sand Sharks)',
    emailEnvVar: 'TEST_CAPTAIN_EMAIL',
    storagePath: STORAGE_PATHS.bianca,
    adoptsExistingSetup: false,
  },
  tyler: {
    key: 'tyler',
    name: 'Tyler Brooks',
    id: 'P11',
    role: 'free agent (no team → captain pickup)',
    emailEnvVar: 'TEST_FREE_AGENT_EMAIL',
    storagePath: STORAGE_PATHS.tyler,
    adoptsExistingSetup: false,
  },
  priya: {
    key: 'priya',
    name: 'Priya Nair',
    id: 'P12',
    role: 'positional player (libero)',
    emailEnvVar: 'TEST_POSITION_EMAIL',
    storagePath: STORAGE_PATHS.priya,
    adoptsExistingSetup: false,
  },
  marcus: {
    key: 'marcus',
    name: 'Marcus Lee',
    id: 'P14',
    role: 'paid-ticket buyer / tipper / refunder',
    emailEnvVar: 'TEST_BUYER_EMAIL',
    storagePath: STORAGE_PATHS.marcus,
    adoptsExistingSetup: false,
  },
  hannah: {
    key: 'hannah',
    name: 'Hannah Schmidt',
    id: 'P15',
    role: 'waitlister (capacity / auto-promote)',
    emailEnvVar: 'TEST_WAITLIST_EMAIL',
    storagePath: STORAGE_PATHS.hannah,
    adoptsExistingSetup: false,
  },
  olivia: {
    key: 'olivia',
    name: 'Olivia Banks',
    id: 'P16',
    role: 'social connector / visibility-scoping hub',
    emailEnvVar: 'TEST_SOCIAL_EMAIL',
    storagePath: STORAGE_PATHS.olivia,
    adoptsExistingSetup: false,
  },

  // ── Lifecycle & platform ──────────────────────────────────────────────
  rachel: {
    key: 'rachel',
    name: 'Rachel Kim',
    id: 'P17',
    role: 'lapsed Pro host (subscription-lifecycle boundaries)',
    emailEnvVar: 'TEST_LAPSED_PRO_EMAIL',
    storagePath: STORAGE_PATHS.rachel,
    adoptsExistingSetup: false,
  },
  zoe: {
    key: 'zoe',
    name: 'Zoe Carter',
    id: 'P18',
    role: 'platform admin',
    emailEnvVar: 'TEST_ADMIN_EMAIL',
    storagePath: STORAGE_PATHS.admin,
    adoptsExistingSetup: true,
  },
};

/** All personas that `auth.personas.setup.ts` is responsible for signing in. */
export const NEW_PERSONA_KEYS: PersonaKey[] = (Object.keys(PERSONAS) as PersonaKey[]).filter(
  (k) => !PERSONAS[k].adoptsExistingSetup,
);

/** The configured email for a persona, or `undefined` if the env var is unset. */
export function personaEmail(key: PersonaKey): string | undefined {
  return process.env[PERSONAS[key].emailEnvVar];
}

/** The storage-state path for a persona's signed-in session. */
export function personaStorage(key: PersonaKey): string {
  return PERSONAS[key].storagePath;
}

/**
 * Skip the current test when the persona's account isn't provisioned on the
 * target environment (no storage file → its auth setup was skipped because the
 * `TEST_*_EMAIL` env var was unset). Mirrors `skipIfMissingAuth`, but the skip
 * message names the persona and the env var to set.
 */
export function skipIfPersonaMissing(key: PersonaKey): void {
  const p = PERSONAS[key];
  if (!fs.existsSync(p.storagePath)) {
    test.skip(
      true,
      `${p.name} (${p.id}) not provisioned — set ${p.emailEnvVar} and sign in once (missing ${path.basename(p.storagePath)})`,
    );
  }
}

/**
 * Run `fn` against a fresh browser context signed in as `key`, always closing
 * the context afterwards. Skips the test (before opening anything) when the
 * persona isn't provisioned. Thin wrapper over `withAuthContext` that hides the
 * storage-path lookup and the skip guard so persona specs read as one line:
 *
 * ```ts
 * await withPersona(browser, 'steve', async (page) => {
 *   await page.goto('/events');
 *   // ...assert as Steve, the co-host...
 * });
 * ```
 */
export async function withPersona<T>(
  browser: Browser,
  key: PersonaKey,
  fn: (page: Page, context: BrowserContext) => Promise<T>,
): Promise<T> {
  skipIfPersonaMissing(key);
  return withAuthContext(browser, personaStorage(key), fn);
}
