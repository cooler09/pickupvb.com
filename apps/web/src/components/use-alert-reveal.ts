'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Reveal a form-level alert so a scrolled-away user always sees it.
 *
 * Long forms (create/edit event) render their error/success alert at the
 * top. A user who has scrolled down to the submit button and triggers an
 * error never sees it. Pass the form-action `state` (whose object identity
 * changes on every submit) as `trigger` and whether a message is currently
 * shown as `active`; on each submit result with `active` true, the
 * referenced element is smooth-scrolled into view and given focus — so
 * keyboard and screen-reader users land on the message too, not just
 * sighted users looking at the top of the form.
 *
 * Attach the returned ref to the alert container and set `tabIndex={-1}` on
 * it so it can receive programmatic focus. The element should also carry
 * `role="alert"` (directly or via the `Alert` primitive) so assistive tech
 * announces it.
 */
export function useAlertReveal<T extends HTMLElement = HTMLDivElement>(
  trigger: unknown,
  active: boolean,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // preventScroll: the smooth scroll above owns the motion; focus must not
    // yank it into an instant jump.
    el.focus({ preventScroll: true });
  }, [trigger, active]);
  return ref;
}
