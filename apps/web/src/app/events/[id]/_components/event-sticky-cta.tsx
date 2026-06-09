'use client';

import { useEffect, useRef, useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
import Link from 'next/link';
import type { Route } from 'next';
import { externalLinkHref } from '@/lib/external-link';
import type { EventHeroCta } from './event-hero';

type Props = {
  cta: EventHeroCta;
  /** CSS selector for the inline panel; the bar hides when this is in view. */
  observeSelector: string;
};

/**
 * Mobile-only sticky bottom CTA bar. Mirrors the hero CTA so the primary
 * action is always one tap away while scrolling. Hides automatically when
 * the inline signup panel is in view to avoid duplicate controls.
 */
export function EventStickyCta({ cta, observeSelector }: Props) {
  const [hidden, setHidden] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cta) return;
    const target = document.querySelector(observeSelector);
    if (!target) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setHidden(entry.isIntersecting);
      },
      { rootMargin: '0px 0px -20% 0px', threshold: 0.1 },
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [cta, observeSelector]);

  if (!cta) return null;

  const baseClass = `${primaryButtonClass('md')} w-full text-center shadow-lg`;

  return (
    <div
      ref={barRef}
      aria-hidden={hidden}
      // `inert` (not just `aria-hidden`) so the still-rendered link leaves the
      // tab order while faded out — `opacity-0` alone keeps it keyboard-
      // focusable, and a focusable node inside an `aria-hidden` subtree is a
      // WCAG 4.1.2 violation. Conditional spread avoids `inert={false}`.
      {...(hidden ? { inert: true } : {})}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity duration-150 sm:hidden ${
        hidden ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="border-border-base bg-bg/95 rounded-shape-sm pointer-events-auto mx-auto max-w-3xl border p-2 shadow-xl backdrop-blur">
        {cta.kind === 'internal' && (
          <Link href={cta.href as Route} className={baseClass}>
            {cta.label}
          </Link>
        )}
        {cta.kind === 'anchor' && (
          <a href={cta.hash} className={baseClass}>
            {cta.label}
          </a>
        )}
        {cta.kind === 'external' && (
          <a href={externalLinkHref(cta.href)} rel="noopener noreferrer" className={baseClass}>
            {cta.label} <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </div>
  );
}
