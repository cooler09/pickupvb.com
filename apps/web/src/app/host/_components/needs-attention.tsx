import Link from 'next/link';
import type { Route } from 'next';
import { LocalDateTime } from '@/components/local-datetime';
import { neutralButtonClass } from '@/components/primary-button';
import { EventActionsMenu } from './event-actions-menu';
import type { AttentionItem, AttentionKind } from '../_loaders/aggregate';

/** Per-kind copy + the action a host should take. */
const KIND_META: Record<
  AttentionKind,
  { tag: string; tagClass: string; blurb: string; cta: string; to: (id: string) => Route }
> = {
  draft: {
    tag: 'Draft',
    tagClass: 'bg-md-warning-container text-md-on-warning-container',
    blurb: 'Not visible to players yet — publish it',
    cta: 'Publish',
    to: (id) => `/events/${id}/edit` as Route,
  },
  full: {
    tag: 'Full',
    tagClass: 'bg-primary/15 text-primary',
    blurb: 'At capacity — review the waitlist',
    cta: 'Manage',
    to: (id) => `/events/${id}/manage` as Route,
  },
  starting_soon: {
    tag: 'Soon',
    tagClass: 'bg-md-success-container text-md-on-success-container',
    blurb: 'Starting within a week',
    cta: 'Manage',
    to: (id) => `/events/${id}/manage` as Route,
  },
};

/**
 * The action layer — events that need the host's attention now (drafts to
 * publish, full events with a waitlist, events starting soon). Renders a calm
 * "all caught up" state when empty so the section never feels broken.
 */
export function NeedsAttention({ items }: { items: ReadonlyArray<AttentionItem> }) {
  return (
    <section className="border-border-base bg-md-surface-container rounded-shape-sm border p-5 sm:p-6">
      <h2 className="text-fg text-title-lg font-semibold">Needs attention</h2>
      {items.length === 0 ? (
        <p className="text-muted mt-3 text-sm">
          You&rsquo;re all caught up — nothing needs action right now.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => {
            const meta = KIND_META[item.kind];
            return (
              <li
                key={item.id}
                className="border-border-base rounded-shape-sm flex items-center gap-3 border p-3"
              >
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.tagClass}`}
                >
                  {meta.tag}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/events/${item.id}` as Route}
                    className="hover:text-primary block truncate text-sm font-semibold"
                  >
                    {item.title}
                  </Link>
                  <p className="text-muted truncate text-xs">
                    {meta.blurb} · <LocalDateTime iso={item.startsAt} variant="dateShort" />
                  </p>
                </div>
                <Link href={meta.to(item.id)} className={`${neutralButtonClass('sm')} shrink-0`}>
                  {meta.cta}
                </Link>
                <EventActionsMenu
                  eventId={item.id}
                  title={item.title}
                  isUpcoming
                  isCancelled={false}
                  attendeeCount={item.attendeeCount}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
