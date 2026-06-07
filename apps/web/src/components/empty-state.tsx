import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { primaryButtonClass, secondaryButtonClass } from './primary-button';

/**
 * Canonical "empty state as a teacher" card (user-onboarding backlog E1).
 *
 * Every blank list should answer three things rather than sit sad and empty:
 * **what** this section is (`title`), **why** it's empty / what it's for
 * (`description`), and **what it unlocks** once populated (`unlocks`), with a
 * single primary CTA to act. Uses the shared CTA vocabulary
 * (`primaryButtonClass` / `secondaryButtonClass`, AGENTS.md pattern #11) so the
 * buttons stay on-brand and consistent across surfaces.
 *
 * Server component — links + text only. For a custom action (e.g. a self-hiding
 * client button like `NewGroupButton`), pass it as `children`; it renders in the
 * action row alongside / instead of the `primary`/`secondary` CTAs. Passing a
 * client-component *element* through a server component is fine — only passing a
 * function across the boundary breaks (see the RSC pitfall in AGENTS.md).
 */
export interface EmptyStateCta {
  href: string;
  label: string;
}

export function EmptyState({
  title,
  description,
  unlocks,
  primary,
  secondary,
  children,
  className,
}: {
  title: string;
  /** One line on why it's empty / what the section is for. */
  description?: string;
  /** A short "here's what this unlocks" line, rendered subtly below the CTA. */
  unlocks?: string;
  primary?: EmptyStateCta;
  secondary?: EmptyStateCta;
  /** Custom action node(s) for the action row (e.g. a self-hiding client button). */
  children?: ReactNode;
  className?: string;
}) {
  const hasActions = Boolean(primary || secondary || children);
  return (
    <div
      className={`border-border-base bg-md-surface-container rounded-shape-sm border p-8 text-center ${className ?? ''}`}
    >
      <h3 className="text-fg text-base font-semibold">{title}</h3>
      {description && <p className="text-muted mx-auto mt-1 max-w-md text-sm">{description}</p>}
      {hasActions && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {primary && (
            <Link href={primary.href as Route} className={primaryButtonClass('sm')}>
              {primary.label}
            </Link>
          )}
          {secondary && (
            <Link href={secondary.href as Route} className={secondaryButtonClass('sm')}>
              {secondary.label}
            </Link>
          )}
          {children}
        </div>
      )}
      {unlocks && <p className="text-muted mx-auto mt-3 max-w-md text-xs">{unlocks}</p>}
    </div>
  );
}
