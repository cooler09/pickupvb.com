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
 * Onion-layer ratchet for the pure inner layers (domain, application — ADR
 * 0001). Returns a flat-config block that:
 *
 *  - **Bans `as never`.** Branded ids must be built with their smart
 *    constructor (`UserId(value)`, `DivisionId(value)`, …) from
 *    `packages/domain/src/shared/brand.ts`, never laundered through
 *    `as never`. (Infrastructure is intentionally exempt — there `as never`
 *    is a Supabase write-payload workaround, a separate concern.)
 *  - **Bans outward/framework imports.** Each layer passes the outer layers
 *    and frameworks it must not reach in `bannedImports`.
 *
 * Both layers are clean today, so these are pure ratchets: green now, and
 * they fail the build the moment a regression is introduced.
 */
export const purityRatchet = ({ bannedImports }) => ({
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'TSAsExpression > TSNeverKeyword',
        message:
          'Do not launder values through `as never`. Construct branded ids with their smart constructor (e.g. UserId(value)) — see packages/domain/src/shared/brand.ts.',
      },
    ],
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
    },
  },
];
