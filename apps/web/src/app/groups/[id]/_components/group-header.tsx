import Image from 'next/image';
import type { ReactNode } from 'react';

type Props = {
  group: {
    id: string;
    slug: string;
    name: string;
    description: string;
    avatarUrl: string | null;
    homeCity: string | null;
    region: string | null;
  };
  /** Inline stats shown next to the group name. */
  stats: {
    members: number;
    upcoming: number;
  };
  /** Action row rendered under the description. Typically a client island
   * that resolves the viewer's session and renders follow / share / manage
   * controls. */
  actions: ReactNode;
};

/**
 * Top-of-page header for a group profile. Public, viewer-independent
 * card: avatar, identity, stats, description. The viewer-conditional
 * controls are delegated to the `actions` slot so the page above can stay
 * ISR-cacheable while a client island renders per-viewer chrome.
 */
export function GroupHeader({ group, stats, actions }: Props) {
  const place = [group.homeCity, group.region].filter(Boolean).join(', ');
  return (
    <header className="border-border-base bg-surface rounded-shape-sm space-y-5 border p-5 sm:p-6">
      <div className="flex items-start gap-4">
        {group.avatarUrl ? (
          <Image
            src={group.avatarUrl}
            alt=""
            width={88}
            height={88}
            className="rounded-shape-sm h-20 w-20 shrink-0 object-cover sm:h-22 sm:w-22"
          />
        ) : (
          <span
            aria-hidden="true"
            className="bg-primary/15 text-primary rounded-shape-sm text-title-lg flex h-20 w-20 shrink-0 items-center justify-center font-semibold"
          >
            {group.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-fg text-headline-sm font-bold">{group.name}</h1>
          <p className="text-muted text-xs">@{group.slug}</p>
          {place && <p className="text-muted text-sm">{place}</p>}
          <p className="text-muted pt-1 text-xs">
            <strong className="text-fg">{stats.members}</strong>{' '}
            {stats.members === 1 ? 'member' : 'members'}
            <span className="mx-1.5">·</span>
            <strong className="text-fg">{stats.upcoming}</strong> upcoming{' '}
            {stats.upcoming === 1 ? 'event' : 'events'}
          </p>
        </div>
      </div>

      {group.description && (
        <p className="text-fg/90 text-sm whitespace-pre-wrap">{group.description}</p>
      )}

      <div className="border-border-base flex flex-wrap items-center gap-2 border-t pt-4">
        {actions}
      </div>
    </header>
  );
}
