import type { ReactNode } from 'react';

/**
 * Small status chip — the "You're in" / payment-status pill on the event
 * RSVP + ticket panels (persona-ux.md P-2). Four ad-hoc copies across
 * `rsvp-panel.tsx` + `paid-ticket-panel.tsx` shared an identical chassis
 * (`rounded-md border px-4 py-2 text-sm font-medium`) and diverged only on
 * color; `tone` keeps the intentional semantics (success = green paid,
 * pending = amber) defined in one place.
 *
 * No `'use client'` — pure presentational `<span>`, so it renders inside the
 * server RSVP/ticket panels directly.
 */
export type StatusPillTone = 'primary' | 'success' | 'pending' | 'neutral';

const TONE: Record<StatusPillTone, string> = {
  primary: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-md-success/30 bg-md-success-container text-md-on-success-container',
  pending: 'border-md-warning/30 bg-md-warning-container text-md-on-warning-container',
  neutral: 'border-border-base bg-fg/5 text-muted',
};

export function StatusPill({
  tone = 'primary',
  className,
  children,
}: {
  tone?: StatusPillTone;
  className?: string;
  children: ReactNode;
}) {
  const base = `rounded-md border px-4 py-2 text-sm font-medium ${TONE[tone]}`;
  return <span className={className ? `${base} ${className}` : base}>{children}</span>;
}
