/**
 * Delight #5 (see docs/delight-backlog.md): a volleyball-net hairline divider
 * that "strings" itself left→right as it scrolls into view. All the motion is a
 * pure CSS view-timeline (`.net-divider__mesh` in globals.css) — no JS, no
 * IntersectionObserver — so this stays a server component and costs nothing at
 * runtime. Decorative, hence `aria-hidden`.
 */
export function NetDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`net-divider ${className ?? ''}`}>
      <span className="net-divider__mesh" />
    </div>
  );
}
