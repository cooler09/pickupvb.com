import type { ReactNode } from 'react';

export type AlertVariant = 'error' | 'success' | 'info' | 'warning';

const VARIANT_CLASSES: Record<AlertVariant, string> = {
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
    success:
        'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
    info: 'border-primary/30 bg-primary/10 text-primary',
    warning:
        'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
};

const ICON_PATH: Record<AlertVariant, string> = {
    // ⚠ exclamation circle
    error: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
    // ✓ check circle
    success: 'M5 13l4 4L19 7',
    // i info circle
    info: 'M12 8h.01M11 12h1v4h1m9-4a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    // ! triangle
    warning: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
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
export function Alert({
    variant = 'info',
    title,
    children,
    className,
    role,
}: AlertProps) {
    const resolvedRole =
        role ?? (variant === 'error' || variant === 'warning' ? 'alert' : 'status');
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
                {title && <p className="font-semibold leading-tight">{title}</p>}
                <div className={title ? 'mt-0.5' : undefined}>{children}</div>
            </div>
        </div>
    );
}
