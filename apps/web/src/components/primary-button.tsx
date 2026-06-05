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
 * Outlined **neutral** — medium-emphasis action that should read as a button
 * but *not* pull primary color: "Message", "✓ Following", row role toggles,
 * "Sign out", "Cancel" next to a non-primary flow. This is the canonical home
 * for the ~80 hand-rolled `border-border-base … hover:bg-fg/5` buttons (the
 * persona-ux secondary-convergence set) that should stay neutral rather than
 * become the primary-tinted {@link secondaryButtonClass}. It deliberately
 * codifies that existing look — neutral border + `fg` label + the M3
 * state-layer standing in for `hover:bg-fg/5` — so converging onto it is a
 * no-visual-change dedup, not a recolor. Pair with `tap-target` for dense
 * list-row actions.
 */
export function neutralButtonClass(size: PrimaryButtonSize = 'sm'): string {
  return `border border-border-base text-fg bg-transparent ${SIZING[size]} ${BASE} disabled:opacity-50`;
}

/**
 * Filled error — destructive, high-emphasis action: "Delete group", "Yes,
 * cancel event", the confirm step of a destructive `ConfirmSubmitButton`.
 * Same filled shape as {@link primaryButtonClass} but painted with the M3
 * `error` role tokens (`bg-md-error` / `text-md-on-error`) so it tracks the
 * theme — including the inverted light-container / dark-label treatment M3
 * uses for errors in dark mode — instead of a hardcoded `bg-red-600
 * text-white` that ignores dark mode. Reserve for genuinely destructive
 * confirms; pair a quieter `secondaryButtonClass` / `textButtonClass`
 * "Cancel" beside it.
 */
export function errorButtonClass(size: PrimaryButtonSize = 'sm'): string {
  return `bg-md-error text-md-on-error ${SIZING[size]} ${BASE} shadow-sm hover:-translate-y-0.5 disabled:opacity-60`;
}

/**
 * Outlined error — medium-emphasis destructive action that should recede
 * relative to a Filled `errorButtonClass` (e.g. the "Delete group…" trigger
 * that opens a two-step confirm). Mirrors {@link secondaryButtonClass} but on
 * the M3 `error` role token (`border-md-error` / `text-md-error`), so it tracks
 * the theme in both light and dark instead of hand-rolled `border-red-300
 * text-red-700 dark:…` recipes.
 */
export function errorOutlinedButtonClass(size: PrimaryButtonSize = 'sm'): string {
  return `border border-md-error text-md-error bg-transparent ${SIZING[size]} ${BASE} disabled:opacity-50`;
}

/**
 * Text error — low-emphasis destructive action: a borderless "Remove" in a
 * dense list row where a Filled/Outlined button would shout. Mirrors
 * {@link textButtonClass} but on the M3 `error` role token (`text-md-error`).
 * Pair with the `tap-target` utility for row actions so it still clears 44px.
 */
export function errorTextButtonClass(size: PrimaryButtonSize = 'sm'): string {
  return `text-md-error bg-transparent ${SIZING[size]} ${BASE} disabled:opacity-50`;
}

/**
 * Tonal error — medium-emphasis destructive/cautioning action that wants a
 * tinted container rather than a shout: "Report", "Flag". Mirrors
 * {@link tonalButtonClass} but on the M3 `error` role token
 * (`bg-md-error/10` container, `text-md-error` label) — theme-aware in both
 * modes, replacing hand-rolled `border-red-300 bg-red-50 … dark:bg-red-950/30`
 * recipes. Completes the error family (Filled / Outlined / Text / Tonal).
 */
export function errorTonalButtonClass(size: PrimaryButtonSize = 'sm'): string {
  return `bg-md-error/10 text-md-error ${SIZING[size]} ${BASE} disabled:opacity-50`;
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
