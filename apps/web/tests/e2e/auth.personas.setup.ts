import { defineAuthSetup } from './_helpers/auth';
import { NEW_PERSONA_KEYS, PERSONAS } from './_helpers/personas';

/**
 * One-time sign-in for every persona that doesn't adopt a pre-existing setup
 * project (docs/personas.md). Registry-driven: each entry in `NEW_PERSONA_KEYS`
 * gets a `defineAuthSetup` with `onMissingEnv: 'skip'`, so a persona whose
 * `TEST_*_EMAIL` isn't set is silently skipped here and `skipIfPersonaMissing`
 * skips its dependent tests at runtime. Adopted personas (Amy, Adam, Julie,
 * Mark, Carlos, Zoe) are signed in by their original `auth.<role>.setup.ts`.
 *
 * Registered as the single `setup-personas` project in playwright.config.ts —
 * all sign-ins run under that one project (vs. one project per file).
 */
for (const key of NEW_PERSONA_KEYS) {
  const p = PERSONAS[key];
  defineAuthSetup({
    role: `persona-${p.key}`,
    email: process.env[p.emailEnvVar],
    password: process.env.TEST_USER_PASSWORD,
    storagePath: p.storagePath,
    emailEnvVar: p.emailEnvVar,
    passwordEnvVar: 'TEST_USER_PASSWORD',
    onMissingEnv: 'skip',
  });
}
