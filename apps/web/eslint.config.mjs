import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      '.turbo/**',
      'next-env.d.ts',
      'tests/**',
      'playwright.config.ts',
      '.playwright/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...next,
  ...nextCoreWebVitals,
  {
    rules: {
      // React 19 + react-hooks 7 introduced new strict rules. Demote to
      // warnings so the upgrade lands; address violations incrementally.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'import/no-anonymous-default-export': 'warn',
    },
  },
];
