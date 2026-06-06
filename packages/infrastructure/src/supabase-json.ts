import type { Json } from '@pickupvb/supabase';

/**
 * Assert a JSON-serializable domain value as the generated `Json` column / RPC-arg
 * type. Supabase's `Json` type has no string index signature, so structurally-typed
 * domain objects (`BracketConfig`, `LiveMatchScore`, message-attachment arrays, the
 * notification outbox `payload` / in-app `data` blobs) aren't assignable to it
 * without an assertion — they *are* JSON at runtime, TypeScript just can't see it.
 *
 * Centralizing the assertion here replaces the per-call `as never` casts that the
 * architecture re-audit (P2-3) flagged: the one sanctioned cast lives in this audited
 * helper instead of bleeding across ~6 adapters, and the `as never` ratchet stays
 * clean. Use this only for values that genuinely round-trip through `JSON.stringify`.
 */
export function asJson(value: unknown): Json {
  return value as Json;
}
