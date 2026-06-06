// Shared ESLint flat config for @pickupvb workspace packages.
//
// Apps/web has its own Next.js-specific config and does not extend this
// file. Library packages (domain, application, infrastructure,
// notifications, supabase, types) consume this as the base in their
// `eslint.config.mjs`.
//
// Kept intentionally minimal so the rollout doesn't explode with
// pre-existing violations. Tighten over time.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared `no-restricted-syntax` entry banning `as never`. Applied repo-wide —
 * this base's default block (so every library package gets it) plus apps/web's
 * own config, which imports this const. As of the 2026-06-06 architecture
 * re-audit (P2-3) no layer is exempt: the inner layers were already clean and
 * the 155 infra/web casts were drained (read-side brand casts → smart
 * constructors; Supabase write payloads → generated `TablesInsert<>` /
 * `TablesUpdate<>` types or the `asJson()` helper). This is now a pure ratchet
 * — green today, fails the build the moment an `as never` reappears anywhere.
 */
export const noAsNeverRule = {
  selector: 'TSAsExpression > TSNeverKeyword',
  message:
    'Do not launder values through `as never`. For branded ids use the smart constructor (UserId(value), EventId(value), …) from packages/domain/src/shared/brand.ts; for Supabase write payloads use the generated TablesInsert<>/TablesUpdate<> types or asJson() (packages/infrastructure/src/supabase-json.ts) — architecture audit P2-3.',
};

/**
 * Onion-layer ratchet for the pure inner layers (domain, application — ADR
 * 0001). Returns a flat-config block that bans outward/framework imports: each
 * layer passes the outer layers and frameworks it must not reach in
 * `bannedImports`. (The `as never` ban now lives in this file's default block
 * via `noAsNeverRule`, so it covers every package — not just these two.)
 */
export const purityRatchet = ({ bannedImports }) => ({
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: bannedImports,
            message:
              'Inner Onion layers must stay framework- and persistence-free and may not import outer layers (ADR 0001).',
          },
        ],
      },
    ],
  },
});

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.turbo/**',
      'coverage/**',
      '*.tsbuildinfo',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': ['error', noAsNeverRule],
    },
  },
  {
    // Test doubles legitimately cast partial mocks to a repository's injection
    // type (`client as never`); the production `as never` ban targets domain
    // laundering, not specs. Keep the ratchet off for test files only.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
