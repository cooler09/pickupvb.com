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

function rawValue(formData: FormData, name: string): string | null {
    const direct = formData.get(name);
    if (typeof direct === 'string') return direct;
    for (const [k, v] of formData.entries()) {
        if (typeof v !== 'string') continue;
        if (k === name) return v;
        if (k.endsWith(`_${name}`) && /^\d+_/.test(k)) return v;
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
 * Read a trimmed field, returning `null` for empty/missing values. Optionally
 * truncates to `maxLen` characters.
 */
export function fieldOrNull(
    formData: FormData,
    name: string,
    maxLen?: number,
): string | null {
    const v = field(formData, name);
    if (v.length === 0) return null;
    return maxLen != null ? v.slice(0, maxLen) : v;
}
