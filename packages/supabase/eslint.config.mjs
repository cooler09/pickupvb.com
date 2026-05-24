import base from '@pickupvb/config/eslint/base';

export default [
  ...base,
  {
    // Generated Supabase database types: skip lint entirely.
    ignores: ['src/database.types.ts'],
  },
];
