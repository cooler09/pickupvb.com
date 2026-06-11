import type { BracketStatus } from '@pickupvb/domain';

/**
 * Lifecycle pill shown next to the bracket page title — the host workspace
 * lacked one while the spectator `/watch` page already had LIVE/Final (UX-10).
 * Shared by both so the treatment stays in sync. `active` → ● LIVE (error role,
 * the broadcast convention), `completed` → Final (success role); `setup` /
 * `draft` are quiet host-facing states; no bracket → nothing.
 */
export function BracketStatusBadge({ status }: { status: BracketStatus | undefined }) {
  if (!status) return null;
  const base = 'rounded-full px-2 py-0.5 text-xs font-medium';
  if (status === 'active') {
    return <span className={`bg-md-error/10 text-md-error ${base}`}>● LIVE</span>;
  }
  if (status === 'completed') {
    return <span className={`bg-md-success/10 text-md-success ${base}`}>Final</span>;
  }
  return (
    <span className={`bg-fg/5 text-muted ${base}`}>{status === 'draft' ? 'Draft' : 'Setup'}</span>
  );
}
