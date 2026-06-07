/**
 * Canonical class strings for **bare** form fields (`<input>`, `<textarea>`,
 * `<select>`) and their labels / helper / error copy.
 *
 * This is the convergence target for persona-ux.md CC-2: before Bundle
 * 2026-05-31b there were 17 near-identical local `inputClass` / `labelClass`
 * definitions that drifted on padding, label size, focus treatment, and
 * background token, so the same edit form read differently on every screen.
 * Import these instead of re-declaring per form.
 *
 * Relationship to the other primitives:
 *  - [text-field.tsx](./text-field.tsx) (`TextField`) is the richer M3
 *    *outlined chassis* primitive — leading/trailing adornments, auto-wired
 *    `aria-describedby`, supporting-text slot. Reach for it when a field wants
 *    those affordances. But `TextField` only wraps `<input>`/`<textarea>` — our
 *    forms are select-heavy (skill tier, surface, division mode, …), so a bare
 *    recipe that styles `<select>` identically is what keeps a whole form
 *    visually coherent. These constants intentionally match `TextField`'s
 *    chassis (same `rounded-md border border-border-base bg-surface px-3 py-2
 *    text-sm`) so a form can mix both without a seam.
 *  - [field-error.tsx](./field-error.tsx) (`FieldError` / `fieldA11y`) owns the
 *    a11y wiring; `fieldErrorClass` here is the matching visual for the simple
 *    inline-`<p>` error pattern some forms use directly.
 *
 * The class string includes `mt-1` so it sits directly under a
 * `fieldLabelClass` label with the right gap.
 */

/** Top-aligned field label. */
export const fieldLabelClass = 'block text-sm font-medium text-fg';

/** Smaller secondary/sub label (checkbox rows, nested controls). */
export const fieldSubLabelClass = 'block text-xs font-medium text-fg';

/** `<input>` / `<textarea>` / `<select>` chassis. Matches the `TextField` look. */
export const fieldInputClass =
  'mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary';

/** Helper / supporting copy under a field. */
export const fieldHintClass = 'mt-1 text-xs text-muted';

/** Inline error copy under a field (pair with `FieldError` for the a11y wiring). */
export const fieldErrorClass = 'mt-1 text-xs text-md-error';
