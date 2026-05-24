'use client';

import { useFormStatus } from 'react-dom';
import type { ComponentProps, ReactNode } from 'react';

type ButtonProps = Omit<ComponentProps<'button'>, 'type' | 'children'>;

type Props = ButtonProps & {
  children: ReactNode;
  /**
   * Optional alternate content rendered while the parent form is
   * submitting. When omitted, the regular `children` is shown unchanged
   * (only the disabled state changes). Pass e.g. "Saving…" to swap the
   * label.
   */
  pendingChildren?: ReactNode;
};

/**
 * Generic submit button that disables itself while the enclosing form's
 * action is pending. Drop-in replacement for `<button type="submit">` to
 * prevent duplicate submissions from impatient double-clicks.
 *
 * Lives at the leaf so server components (e.g. hosts-section.tsx) can
 * import it without converting their whole subtree to a client component.
 */
export function SubmitButton({ children, pendingChildren, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} {...rest}>
      {pending && pendingChildren !== undefined ? pendingChildren : children}
    </button>
  );
}
