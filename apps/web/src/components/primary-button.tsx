import type { ComponentProps, ReactNode } from 'react';

/**
 * Canonical primary-CTA styling, kept in one place so the same class
 * string can be spread onto a `<button>`, `<a>`, `next/link`, or our
 * `<SubmitButton>` wrapper without forking the visual. Use this instead
 * of hand-rolling `bg-primary text-primary-fg rounded …` at each call
 * site — the audit catches drift fast.
 *
 * Two sizes:
 *  - `'sm'` (default): tight inline action — table-row buttons, header
 *    actions, list-item CTAs. Maps to `px-3 py-1.5 text-sm`.
 *  - `'md'`: headline CTA on a page or panel — the action the user came
 *    to perform. Maps to `px-4 py-2 text-sm`.
 *
 * Sizes intentionally share the same `text-sm` baseline so adjacent
 * primary + secondary buttons line up. Bumping a CTA from sm → md only
 * changes hit-target size, not type scale.
 *
 * Disabled state opacity (`disabled:opacity-60`) matches the rest of the
 * button vocabulary in this app; `hover:opacity-90` gives a subtle
 * darkening on the primary fill without needing a hover-specific color.
 */
export type PrimaryButtonSize = 'sm' | 'md';

export function primaryButtonClass(size: PrimaryButtonSize = 'sm'): string {
  const sizing = size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-sm';
  return `bg-primary text-primary-fg ${sizing} inline-flex items-center justify-center rounded-md font-semibold shadow-sm hover:opacity-90 disabled:opacity-60`;
}

/**
 * Thin `<button>` wrapper for the most common case. For `Link` / `a` /
 * `SubmitButton`, spread `primaryButtonClass()` onto `className` instead
 * — wrapping each would force every call site through a discriminated
 * union we don't need.
 */
export function PrimaryButton({
  size = 'sm',
  className,
  children,
  ...rest
}: Omit<ComponentProps<'button'>, 'children'> & {
  size?: PrimaryButtonSize;
  children: ReactNode;
}) {
  const cls = className ? `${primaryButtonClass(size)} ${className}` : primaryButtonClass(size);
  return (
    <button {...rest} className={cls}>
      {children}
    </button>
  );
}
