import type { ComponentProps, ReactNode } from 'react';

/**
 * Canonical button vocabulary, kept in one place so the same class string
 * can be spread onto a `<button>`, `<a>`, `next/link`, or our
 * `<SubmitButton>` wrapper without forking the visual. Use these instead
 * of hand-rolling `bg-primary text-primary-fg rounded …` at each call
 * site — the audit catches drift fast.
 *
 * Four M3 variants ([m3.material.io/components/buttons](https://m3.material.io/components/buttons)):
 *
 *  - **`primaryButtonClass`** (Filled) — the page's main CTA. High
 *    emphasis. Solid fill. One per surface, ideally.
 *  - **`tonalButtonClass`** (Filled tonal) — medium-emphasis affirmative
 *    action. Sits between Filled and Outlined; reads as a quieter
 *    primary. Pairs well next to a Filled button for a "do this OR that"
 *    choice.
 *  - **`secondaryButtonClass`** (Outlined) — medium-emphasis action that
 *    needs to recede visually. The audit's "secondary" — outline-only
 *    border, no fill.
 *  - **`textButtonClass`** (Text) — low-emphasis inline action. No
 *    border, no fill — just colored label with a state-layer overlay on
 *    hover/focus/active.
 *
 * Sizes (shared across all variants):
 *  - `'sm'` (default): tight inline action — table-row buttons, header
 *    actions, list-item CTAs. Maps to `px-3 py-1.5 text-sm`.
 *  - `'md'`: headline CTA on a page or panel — the action the user came
 *    to perform. Maps to `px-4 py-2 text-sm`.
 *
 * Sizes intentionally share the same `text-sm` baseline so adjacent
 * primary + secondary buttons line up. Bumping a CTA from sm → md only
 * changes hit-target size, not type scale.
 *
 * Hover / focus / pressed are all delegated to the M3 `state-layer`
 * utility (Bundle 3) — a `currentColor` overlay at the system state
 * alphas. No per-variant `hover:opacity-*` / `hover:bg-fg/5` here.
 */
export type PrimaryButtonSize = 'sm' | 'md';

const SIZING: Record<PrimaryButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

// Tactile press: a tiny scale-down on `:active` gives every button physical
// feedback. `transition-transform` covers the individual `scale`/`translate`
// properties in Tailwind v4; the global `prefers-reduced-motion` rule defangs
// the transition (the state still applies, just without the travel).
const BASE =
  'state-layer inline-flex items-center justify-center rounded-md font-semibold transition-transform active:scale-[0.98]';

export function primaryButtonClass(size: PrimaryButtonSize = 'sm'): string {
  // The headline CTA also lifts a hair on hover — a "serve" nudge that marks
  // it as the primary action without disturbing layout.
  return `bg-primary text-primary-fg ${SIZING[size]} ${BASE} shadow-sm hover:-translate-y-0.5 disabled:opacity-60`;
}

/**
 * Filled tonal — medium emphasis. Sits between Filled and Outlined in
 * the M3 hierarchy. Uses the existing primary token at 10% as the
 * container fill so it reads as a tinted version of the primary CTA
 * without pulling in the full M3 `secondary-container` role yet.
 */
export function tonalButtonClass(size: PrimaryButtonSize = 'sm'): string {
  return `bg-primary/10 text-primary ${SIZING[size]} ${BASE} disabled:opacity-50`;
}

/**
 * Outlined — medium emphasis, recedes visually. The audit's
 * "secondary". Border-only; no fill. State-layer paints in the
 * `currentColor` (primary), so hover/focus give a faint tint over the
 * transparent fill.
 */
export function secondaryButtonClass(size: PrimaryButtonSize = 'sm'): string {
  return `border border-primary text-primary bg-transparent ${SIZING[size]} ${BASE} disabled:opacity-50`;
}

/**
 * Text — low emphasis. No border, no fill, just a colored label and
 * the state-layer on interaction. Use for inline actions inside a card
 * header, "Cancel" alongside a Filled "Save", etc.
 */
export function textButtonClass(size: PrimaryButtonSize = 'sm'): string {
  return `text-primary bg-transparent ${SIZING[size]} ${BASE} disabled:opacity-50`;
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
