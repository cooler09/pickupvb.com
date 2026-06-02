import Link from 'next/link';
import { eventToolHref } from '../_lib/event-binding';

/**
 * "Host tools" quick-links card — surfaces the standalone tools in-context from
 * an event surface (manage dashboard, bracket page), each launching with the
 * event/division bound so the tool pre-fills and can save back. Closes the
 * discovery gap (docs/audits/tournament-tools-workflow.md TT-1). Server
 * component: plain links, no client JS.
 */
export type EventToolSlug = 'team-randomizer' | 'seeding' | 'scheduler' | 'standings';

const TOOL_META: Record<
  EventToolSlug,
  { title: string; desc: string; scope: 'event' | 'division' }
> = {
  'team-randomizer': {
    title: 'Team randomizer',
    desc: 'Split the roster into balanced teams — then save them as ad-hoc teams.',
    scope: 'event',
  },
  seeding: {
    title: 'Seeding',
    desc: 'Rank or draw a seed order, then apply it to the bracket.',
    scope: 'division',
  },
  scheduler: {
    title: 'Round-robin scheduler',
    desc: 'Preview a pool-play schedule from your registered teams.',
    scope: 'division',
  },
  standings: {
    title: 'Standings',
    desc: 'Track a live win/loss table across devices.',
    scope: 'division',
  },
};

export function EventToolsCard({
  eventId,
  ret,
  divisionId,
  tools,
  heading = true,
}: {
  eventId: string;
  ret: string;
  divisionId?: string | undefined;
  tools: ReadonlyArray<EventToolSlug>;
  /** When false, render the bare link grid (for embedding under an existing heading). */
  heading?: boolean;
}) {
  const grid = (
    <ul className="grid gap-2 sm:grid-cols-2">
      {tools.map((slug) => {
        const meta = TOOL_META[slug];
        const binding =
          meta.scope === 'division' && divisionId ? { eventId, divisionId, ret } : { eventId, ret };
        return (
          <li key={slug}>
            <Link
              href={eventToolHref(slug, binding)}
              className="group border-border-base hover:border-primary hover:bg-primary/5 rounded-shape-sm flex h-full flex-col border p-3 transition-colors"
            >
              <span className="text-fg text-sm font-medium">{meta.title}</span>
              <span className="text-muted mt-0.5 text-xs">{meta.desc}</span>
              <span className="text-primary mt-2 text-xs font-medium">Open →</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  if (!heading) return grid;

  return (
    <div className="border-border-base bg-fg/[0.02] rounded-shape-sm space-y-3 border p-4">
      <div>
        <h3 className="text-fg text-sm font-semibold">Host tools</h3>
        <p className="text-muted text-xs">
          Open a tool pre-filled with this event{'’'}s roster and teams — results save back here.
        </p>
      </div>
      {grid}
    </div>
  );
}
