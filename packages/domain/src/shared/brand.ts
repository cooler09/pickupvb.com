/**
 * Branded type helper for type-safe IDs / value objects.
 * Prevents accidentally passing a UserId where an EventId is expected.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export const brand =
  <B extends string>() =>
  <T>(value: T): Brand<T, B> =>
    value as Brand<T, B>;

/**
 * Smart-constructor factory for string-backed branded IDs. Pair it with a
 * branded type so each id gets a value-level constructor that lives next to
 * the type:
 *
 *   export type UserId = Brand<string, 'UserId'>;
 *   export const UserId = idConstructor<'UserId'>();
 *
 * Boundary code then writes `UserId(row.user_id)` instead of laundering a
 * raw string through `as never` / `as UserId`. The `as never` escape hatch
 * is banned by lint in the domain + application layers for exactly this
 * reason — construct the brand, don't cast it.
 */
export const idConstructor =
  <B extends string>() =>
  (value: string): Brand<string, B> =>
    value as Brand<string, B>;
