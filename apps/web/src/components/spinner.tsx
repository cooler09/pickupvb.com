import type { ComponentProps } from 'react';

/**
 * Inline loading spinner — the app's canonical "working…" affordance for a
 * pending action. Paints in `currentColor` so it inherits the surrounding
 * label color (white on a Filled primary, `fg` on a neutral button, …) with
 * no per-call-site theming.
 *
 * Hidden under `prefers-reduced-motion`: the global reduced-motion rule in
 * globals.css pins `animation-iteration-count: 1`, which would freeze the
 * spinner mid-rotation and read as broken. For those users the pending state
 * is still conveyed by the disabled button + any swapped label / `aria-busy`,
 * so we drop the spinner rather than show a stuck one (`motion-reduce:hidden`).
 *
 * Decorative (`aria-hidden`) — the live region / `aria-busy` on the control
 * owns the announcement; the spinner is the visual half of that pair.
 */
export function Spinner({ className, ...rest }: ComponentProps<'svg'>) {
  return (
    <svg
      className={`animate-spin motion-reduce:hidden ${className ?? 'h-4 w-4'}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
