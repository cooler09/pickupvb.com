import Link from 'next/link';
import type { Route } from 'next';

type Props = {
    /** When true, renders as a link to the Pro billing page (use for self). */
    asLink?: boolean;
    /** Tooltip / aria-label override. */
    title?: string;
};

/**
 * Small pill that marks a Pro Host. Source of truth is `isPro(userId)` from
 * `@/lib/pro` — call that and conditionally render this badge.
 */
export function ProBadge({ asLink = false, title }: Props) {
    const label = title ?? 'Pro Host — supports PickupVB and hosts paid events';
    const content = (
        <span
            title={label}
            aria-label={label}
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 shadow-sm"
        >
            <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3 w-3"
            >
                <path d="M10 1.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L10 14.9l-5.25 2.76 1-5.86L1.5 7.66l5.9-.86L10 1.5z" />
            </svg>
            Pro
        </span>
    );

    if (asLink) {
        return (
            <Link
                href={'/profile/billing/pro' as Route}
                className="inline-flex"
            >
                {content}
            </Link>
        );
    }
    return content;
}
