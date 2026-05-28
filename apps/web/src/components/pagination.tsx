import Link from 'next/link';
import type { Route } from 'next';

/**
 * Server-rendered pagination bar.
 *
 * Renders Prev/Next links and a small "Page X of Y · N total" indicator.
 * Builds hrefs by cloning the current `searchParams` and overriding the
 * page key, so it preserves any active filters (`q`, `city`, etc.) on
 * navigation.
 *
 * `basePath` is the route this control links back to (e.g. `/groups`).
 * `pageSize` is the per-page count used to compute total pages.
 * `pageParam` lets a page host multiple independent paginators (e.g.
 *   `mpage` for members + `ppage` for past events). Defaults to `page`.
 * Page numbers are 1-indexed in the URL; clamp on the page itself.
 */
export function Pagination({
  basePath,
  page,
  pageSize,
  total,
  searchParams,
  pageParam = 'page',
  scrollToId,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  searchParams: Record<string, string | undefined>;
  pageParam?: string;
  /** Optional element id to anchor-scroll to on navigation (per-section). */
  scrollToId?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const hrefFor = (target: number): Route => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === pageParam || v === undefined || v === '') continue;
      params.set(k, v);
    }
    if (target > 1) params.set(pageParam, String(target));
    const qs = params.toString();
    const hash = scrollToId ? `#${scrollToId}` : '';
    const path = qs ? `${basePath}?${qs}${hash}` : `${basePath}${hash}`;
    return path as Route;
  };

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  // Pagination links carry text labels but still need the 48dp M3 touch
  // target on mobile — `tap-target` enforces the floor; `px-3` keeps the
  // horizontal padding so the label doesn't kiss the border.
  const baseLinkClass = 'tap-target gap-1 rounded-md border border-border-base px-3 text-sm';
  const enabledClass = `${baseLinkClass} hover:bg-fg/5`;
  const disabledClass = `${baseLinkClass} cursor-not-allowed opacity-50`;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-2">
      {prevDisabled ? (
        <span aria-disabled="true" className={disabledClass}>
          ← Prev
        </span>
      ) : (
        <Link href={hrefFor(page - 1)} rel="prev" className={enabledClass}>
          ← Prev
        </Link>
      )}
      <p className="text-muted text-xs">
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
