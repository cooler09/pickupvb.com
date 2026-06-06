import Link from 'next/link';
import type { Route } from 'next';

/** Card section heading with an optional `(count)` and a right-aligned action
 *  link. Extracted from profile/page.tsx (architecture audit P3-1). */
export function SectionHeader({
  title,
  count,
  countLabel,
  action,
}: {
  title: string;
  count?: number;
  countLabel?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-bold">
        {title}
        {typeof count === 'number' && (
          <span className="text-muted ml-1.5 text-sm font-normal">
            ({count}
            {countLabel ? ` ${countLabel}` : ''})
          </span>
        )}
      </h2>
      {action && (
        <Link
          href={action.href as Route}
          className="text-primary text-sm font-medium hover:underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Tappable tile linking to a profile action (filled-primary or bordered).
 *  Extracted from profile/page.tsx (architecture audit P3-1). */
export function ActionTile({
  href,
  title,
  description,
  variant,
}: {
  href: Route;
  title: string;
  description: string;
  variant?: 'primary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <Link
      href={href}
      className={
        isPrimary
          ? // Filled-primary surface: M3 state-layer (currentColor overlay at
            // system alphas) for hover/focus/pressed — same signature as
            // `primaryButtonClass`, not a one-off `hover:opacity-90` (PR-5).
            'bg-primary text-primary-fg state-layer rounded-shape-sm block p-4'
          : 'border-border-base bg-surface hover:border-primary/40 rounded-shape-sm block border p-4 transition'
      }
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className={isPrimary ? 'mt-0.5 text-xs opacity-80' : 'text-muted mt-0.5 text-xs'}>
        {description}
      </p>
    </Link>
  );
}
