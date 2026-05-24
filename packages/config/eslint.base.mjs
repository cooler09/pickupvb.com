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
