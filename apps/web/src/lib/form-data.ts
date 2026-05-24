/**
 * Helpers for reading FormData in server actions.
 *
 * Why `field()` instead of `String(formData.get(name) ?? '').trim()`?
 *
 * In Next 14 / React 18, server actions invoked through `useFormState`
 * receive form fields with a numeric prefix (e.g. `1_email`) because slot
 * `0` holds the previous-state reference. So `formData.get('email')`
 * returns `null` and the bare-string idiom silently produces an empty
 * string. `field()` looks for both the bare name and any `<digit>_<name>`
 * variant, so the helper works whether the form is wired with
 * `useFormState`, `.bind()`, or a plain `<form action={fn}>`.
 */

/**
 * Global hard cap on the length of any single form field, in characters.
 *
 * Per-call `maxLen` arguments in `fieldOrNull()` can be smaller (and usually
 * are — see `apps/web/src/app/profile/actions.ts`), but they can never raise
 * the ceiling above this value. This protects every server action from a
 * manually-crafted POST with a 1 MB `first_name` payload regardless of
 * whether the caller passed an explicit `maxLen`.
 *
 * 4 KB comfortably covers every legitimate text field we accept (longest
 * today is `business_address` at 400 chars) while keeping memory pressure
 * bounded even under adversarial input.
 */
export const FIELD_HARD_MAX = 4096;

function rawValue(formData: FormData, name: string): string | null {
  const direct = formData.get(name);
  if (typeof direct === 'string') return direct.slice(0, FIELD_HARD_MAX);
  for (const [k, v] of formData.entries()) {
    if (typeof v !== 'string') continue;
    if (k === name) return v.slice(0, FIELD_HARD_MAX);
    if (k.endsWith(`_${name}`) && /^\d+_/.test(k)) return v.slice(0, FIELD_HARD_MAX);
  }
  return null;
}

/** Read a trimmed string field. Returns `''` if missing. */
export function field(formData: FormData, name: string): string {
  return (rawValue(formData, name) ?? '').trim();
}

/** Read a trimmed field, returning `undefined` for empty/missing values. */
export function fieldOrUndefined(formData: FormData, name: string): string | undefined {
  const v = field(formData, name);
  return v.length === 0 ? undefined : v;
}

/**
 * Read a boolean checkbox field. Returns `true` if the input was submitted
 * with any non-empty value (browsers send `'on'` by default), `false`
 * otherwise. Uses the same slot-prefix lookup as `field()` so it works with
 * `useFormState`, `.bind()`, and plain `<form action={fn}>`.
 */
export function bool(formData: FormData, name: string): boolean {
  const v = rawValue(formData, name);
  return v !== null && v.length > 0;
}

/**
 * Read a trimmed field, returning `null` for empty/missing values. Optionally
 * truncates to `maxLen` characters.
 */
export function fieldOrNull(formData: FormData, name: string, maxLen?: number): string | null {
  const v = field(formData, name);
  if (v.length === 0) return null;
  return maxLen != null ? v.slice(0, maxLen) : v;
}
