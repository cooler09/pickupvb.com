import base, { purityRatchet } from '@pickupvb/config/eslint/base';

// Domain is the innermost Onion layer: pure TypeScript, no framework,
// persistence, or outer-layer (application/infrastructure) imports, and no
// `as never` brand laundering. See ADR 0001.
export default [
  ...base,
  purityRatchet({
    bannedImports: [
      'next',
      'next/*',
      'react',
      'react-dom',
      'react-dom/*',
      '@supabase/*',
      '@pickupvb/supabase',
      '@pickupvb/supabase/*',
      '@pickupvb/infrastructure',
      '@pickupvb/infrastructure/*',
      '@pickupvb/application',
      '@pickupvb/application/*',
    ],
  }),
];
