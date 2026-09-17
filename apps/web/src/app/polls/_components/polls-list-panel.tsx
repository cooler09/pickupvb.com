import Link from 'next/link';
import type { Route } from 'next';
import type { PollSummary } from '@pickupvb/domain';
import { primaryButtonClass } from '@/components/primary-button';

/**
 * Shared "Polls" list + "New poll" affordance (ADR 0041, Phase 2). Rendered on
 * the event-manage page and the group polls page — each passes the prefilled
 * `newHref` (`/polls/new?eventId=…` or `?groupId=…`). Server component; just
 * links. Only the viewer's own polls appear (creator-only RLS).
 */
export function PollsListPanel({
  polls,
  newHref,
  heading = 'Polls',
  subtitle = 'Gather quick answers with a share link — no account needed to respond.',
}: {
  polls: PollSummary[];
  newHref: Route;
  heading?: string;
  subtitle?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-fg text-title-lg font-semibold">{heading}</h2>
          <p className="text-muted text-sm">{subtitle}</p>
        </div>
        <Link href={newHref} className={primaryButtonClass('sm')}>
          New poll
        </Link>
      </div>

      {polls.length > 0 && (
        <ul className="divide-border-base border-border-base divide-y rounded-md border">
          {polls.map((p) => (
            <li key={p.id}>
              <Link
                href={`/polls/${p.id}`}
                className="hover:bg-md-surface-container-high flex items-center justify-between gap-3 p-3"
              >
                <span className="min-w-0">
                  <span className="text-fg block truncate text-sm font-medium">{p.title}</span>
                  <span className="text-muted text-xs">
                    {p.responseCount} {p.responseCount === 1 ? 'response' : 'responses'}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.status === 'open'
                      ? 'bg-md-success/15 text-md-success'
                      : 'bg-md-error/15 text-md-error'
                  }`}
                >
                  {p.status === 'open' ? 'Open' : 'Closed'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
