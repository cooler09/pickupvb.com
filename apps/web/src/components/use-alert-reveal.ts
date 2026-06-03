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
    // Only scroll when the alert is actually off-screen — on a short form
    // that's already fully visible, re-centering it would be a jarring jump
    // for no benefit. Focus moves either way (the WCAG error-summary
    // pattern), but with preventScroll so it never yanks the smooth scroll
    // into an instant jump.
    const rect = el.getBoundingClientRect();
    const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!fullyVisible) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }, [trigger, active]);
  return ref;
}
