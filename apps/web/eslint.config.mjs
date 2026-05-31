import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
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
      'coverage/**',
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
  {
    // M3 shape-scale ratchet (docs/audits/m3-alignment.md P2 #7, Bundle 139).
    //
    // Bundle 139 codemodded the *value-preserving* raw `rounded-*` classes to
    // the M3 shape scale (rounded-lg→rounded-shape-sm = 8px,
    // rounded-xl→rounded-shape-md = 12px, rounded-2xl→rounded-shape-lg = 16px).
    // These rules forbid re-introducing the eliminated classes so the
    // migration can't silently regress — "lock eliminated only" per the audit.
    //
    // Intentionally NOT forbidden: `rounded-md` (6px — no exact M3 token, needs
    // per-component role judgment) and `rounded-full` (maps 1:1 to shape-full;
    // `rounded-full` reads fine). Their ratchet lands WITH the role-aware
    // migration, not before it. The selectors match the class as a whole token
    // (start / space / variant-colon boundary) so `rounded-shape-lg` and
    // directional forms aren't false-positives.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/(?:^|[\\s:])rounded-(?:lg|xl|2xl)(?![\\w-])/]',
          message:
            'Use the M3 shape scale (rounded-shape-sm = 8px, rounded-shape-md = 12px, rounded-shape-lg = 16px) instead of raw rounded-lg/xl/2xl. Eliminated in Bundle 139 — see docs/audits/m3-alignment.md P2 #7.',
        },
        {
          selector: 'TemplateElement[value.cooked=/(?:^|[\\s:])rounded-(?:lg|xl|2xl)(?![\\w-])/]',
          message:
            'Use the M3 shape scale (rounded-shape-sm/md/lg) instead of raw rounded-lg/xl/2xl in template literals. Eliminated in Bundle 139 — see docs/audits/m3-alignment.md P2 #7.',
        },
      ],
    },
  },
];

export default config;
