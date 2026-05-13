/**
 * Branded type helper for type-safe IDs / value objects.
 * Prevents accidentally passing a UserId where an EventId is expected.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export const brand = <B extends string>() =>
    <T>(value: T): Brand<T, B> => value as Brand<T, B>;
