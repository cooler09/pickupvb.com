import Link from 'next/link';
import type { Route } from 'next';
import type { BracketStatus } from '@pickupvb/domain';

/**
 * Division tab strip shared by the host bracket workspace
 * (`/events/[id]/bracket`) and the public spectator view (`/bracket/watch`) —
 * previously duplicated markup on both. A plain server component (no
 * interactivity beyond `<Link>` navigation), so it composes into either server
 * page without a client boundary.
 *
 * Each tab carries a per-division status pill (UX-9) so a host running a
 * multi-division tournament can see at a glance which divisions are set up /
 * live / final without opening every tab. The pill mirrors the watch header's
 * LIVE/Final treatment (● Live in the error role, ✓ Final in the success role).
 *
 * Renders nothing for a single-division event — there's no tab to switch.
 */
export function DivisionTabs(props: {
  divisions: ReadonlyArray<{ id: string; label: string }>;
  selectedId: string;
  /** Base path the tabs link into, e.g. `/events/${id}/bracket` or its `/watch`
   *  twin. Each tab appends `?division=<id>`. */
  basePath: string;
  /** Per-division bracket status, keyed by division id. Divisions absent from
   *  the map have no bracket yet and show no pill. */
  statusByDivision?: ReadonlyMap<string, BracketStatus>;
}) {
  if (props.divisions.length <= 1) return null;
  return (
    <nav aria-label="Divisions" className="border-border-base flex flex-wrap gap-1 border-b">
      {props.divisions.map((d) => {
        const active = d.id === props.selectedId;
        const status = props.statusByDivision?.get(d.id);
        return (
          <Link
            key={d.id}
            href={`${props.basePath}?division=${d.id}` as Route}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px flex items-center gap-1.5 rounded-t px-3 py-2 text-sm ${
              active
                ? 'border-border-base bg-bg text-fg border border-b-transparent font-medium'
                : 'text-muted hover:text-fg'
            }`}
          >
            {d.label}
            <DivisionStatusPill status={status} />
          </Link>
        );
      })}
    </nav>
  );
}

function DivisionStatusPill({ status }: { status: BracketStatus | undefined }) {
  if (!status) return null;
  if (status === 'active') {
    return (
      <span className="text-md-error text-xs font-semibold">
        <span aria-hidden="true">● </span>Live
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="text-md-success text-xs font-semibold">
        <span aria-hidden="true">✓ </span>Final
      </span>
    );
  }
  // setup / draft — quiet, informational.
  return <span className="text-muted text-xs">{status === 'draft' ? 'Draft' : 'Setup'}</span>;
}
