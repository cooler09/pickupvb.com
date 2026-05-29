import base, { purityRatchet } from '@pickupvb/config/eslint/base';

// Application is a pure inner Onion layer: CQRS handlers that depend only on
// domain ports. No framework, no persistence, no infrastructure imports, and
// no `as never` brand laundering. See ADR 0001. (It may import
// @pickupvb/domain — that's the allowed inward dependency.)
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
    ],
  }),
];
