import Link from 'next/link';
import type { Route } from 'next';

/**
 * Server-rendered pagination bar.
 *
 * Renders Prev/Next links and a small "Page X of Y · N total" indicator.
 * Builds hrefs by cloning the current `searchParams` and overriding `page`,
 * so it preserves any active filters (`q`, `city`, etc.) on navigation.
 *
 * `basePath` is the route this control links back to (e.g. `/groups`).
 * `pageSize` is the per-page count used to compute total pages.
 * Page numbers are 1-indexed in the URL; clamp on the page itself.
 */
export function Pagination({
    basePath,
    page,
    pageSize,
    total,
    searchParams,
}: {
    basePath: string;
    page: number;
    pageSize: number;
    total: number;
    searchParams: Record<string, string | undefined>;
}) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (totalPages <= 1) return null;

    const hrefFor = (target: number): Route => {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(searchParams)) {
            if (k === 'page' || v === undefined || v === '') continue;
            params.set(k, v);
        }
        if (target > 1) params.set('page', String(target));
        const qs = params.toString();
        return (qs ? `${basePath}?${qs}` : basePath) as Route;
    };

    const prevDisabled = page <= 1;
    const nextDisabled = page >= totalPages;

    const baseLinkClass =
        'inline-flex items-center gap-1 rounded-md border border-border-base px-3 py-1.5 text-sm';
    const enabledClass = `${baseLinkClass} hover:bg-fg/5`;
    const disabledClass = `${baseLinkClass} cursor-not-allowed opacity-50`;

    return (
        <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-3 pt-2"
        >
            {prevDisabled ? (
                <span aria-disabled="true" className={disabledClass}>
                    ← Prev
                </span>
            ) : (
                <Link href={hrefFor(page - 1)} rel="prev" className={enabledClass}>
                    ← Prev
                </Link>
            )}
            <p className="text-xs text-muted">
                Page {page} of {totalPages} · {total} total
            </p>
            {nextDisabled ? (
                <span aria-disabled="true" className={disabledClass}>
                    Next →
                </span>
            ) : (
                <Link href={hrefFor(page + 1)} rel="next" className={enabledClass}>
                    Next →
                </Link>
            )}
        </nav>
    );
}
