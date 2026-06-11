'use client';

import { useFormStatus } from 'react-dom';
import type { ComponentProps, ReactNode } from 'react';
import { Spinner } from './spinner';

type ButtonProps = Omit<ComponentProps<'button'>, 'type' | 'children'>;

type Props = ButtonProps & {
  children: ReactNode;
  /**
   * Optional alternate content rendered while the parent form is
   * submitting. When omitted, the regular `children` is shown unchanged
   * (only the disabled state + spinner change). Pass e.g. "Saving…" to swap
   * the label.
   */
  pendingChildren?: ReactNode;
  /**
   * Suppress the inline pending spinner. Defaults to showing it. Set on the
   * rare control where a leading spinner would crowd the layout (e.g. an
   * icon-only button) and the disabled state alone is enough.
   */
  noSpinner?: boolean;
};

/**
 * Generic submit button that disables itself while the enclosing form's
 * action is pending. Drop-in replacement for `<button type="submit">` to
 * prevent duplicate submissions from impatient double-clicks.
 *
 * While pending it also renders a leading {@link Spinner} and sets
 * `aria-busy`, so the user gets a "working…" cue on every form action — not
 * just the ones that pass `pendingChildren`. The button classes already use
 * `inline-flex items-center`, so the spinner sits inline with the label.
 *
 * Lives at the leaf so server components (e.g. hosts-section.tsx) can
 * import it without converting their whole subtree to a client component.
 */
export function SubmitButton({ children, pendingChildren, noSpinner, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  const label = pending && pendingChildren !== undefined ? pendingChildren : children;
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending} {...rest}>
      {pending && !noSpinner && <Spinner className="mr-2 h-4 w-4" />}
      {label}
    </button>
  );
}
