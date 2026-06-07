import type { ReactNode } from 'react';

export type AlertVariant = 'error' | 'success' | 'info' | 'warning';

// M3 container roles — bg = `{role}-container`, text = `on-{role}-container`,
// border = the role at low alpha. The tokens already carry light/dark values
// (see globals.css), so no hand-rolled `dark:` variants are needed. `warning`
// and `success` are the custom semantic roles added in S2.
const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'border-md-error/30 bg-md-error-container text-md-on-error-container',
  success: 'border-md-success/30 bg-md-success-container text-md-on-success-container',
  // info uses brand tokens (not raw palette) — left as-is; not an S2 target.
  info: 'border-primary/30 bg-primary/10 text-primary',
  warning: 'border-md-warning/30 bg-md-warning-container text-md-on-warning-container',
};

const ICON_PATH: Record<AlertVariant, string> = {
  // ⚠ exclamation circle
  error:
    'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
  // ✓ check circle
  success: 'M5 13l4 4L19 7',
  // i info circle
  info: 'M12 8h.01M11 12h1v4h1m9-4a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  // ! triangle
  warning:
    'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
  /** Override the default ARIA role. Defaults to "alert" for error/warning, "status" otherwise. */
  role?: 'alert' | 'status';
}

/**
 * Inline alert/notice. Pairs an icon with optional title and message,
 * with consistent color treatment per variant.
 */
export function Alert({ variant = 'info', title, children, className, role }: AlertProps) {
  const resolvedRole = role ?? (variant === 'error' || variant === 'warning' ? 'alert' : 'status');
  return (
    <div
      role={resolvedRole}
      className={[
        'flex items-start gap-3 rounded-md border p-3 text-sm',
        VARIANT_CLASSES[variant],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 h-4 w-4 flex-none"
      >
        <path d={ICON_PATH[variant]} />
      </svg>
      <div className="min-w-0 flex-1">
        {title && <p className="leading-tight font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5' : undefined}>{children}</div>
      </div>
    </div>
  );
}
