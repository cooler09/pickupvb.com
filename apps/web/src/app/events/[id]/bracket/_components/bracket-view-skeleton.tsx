/**
 * Neutral placeholder shown while the viewer's manage capabilities are still
 * resolving client-side (UX-1). The bracket page is cacheable + viewer-
 * independent, so `useEventManageCaps` starts as a spectator and flips to host
 * after a post-hydration round-trip. Rendering this instead of the spectator
 * "check back" copy during that window stops a host from briefly seeing a
 * message that contradicts the controls about to appear.
 */
export function BracketViewSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="bg-fg/5 h-4 w-2/3 animate-pulse rounded" />
      <div className="bg-fg/5 h-4 w-1/2 animate-pulse rounded" />
    </div>
  );
}
