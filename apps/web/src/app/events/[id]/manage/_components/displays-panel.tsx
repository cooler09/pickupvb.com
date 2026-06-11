import type { EventDetailReadModel } from '@pickupvb/domain';
import { DisplayLinkRow } from './display-link-row';

/**
 * Host "Displays" hub (tournament-displays slice D) — one place to grab the
 * full-screen kiosk links for putting the live bracket / schedule on a gym TV
 * or tablet. Each division gets its own row (QR + copy + open) so a host can
 * point a different screen at each division.
 *
 * Display mode is a Pro-host perk, so the manage page only renders this panel
 * when the event's host is Pro (`hostIsPro`) — mirroring the page-level gate on
 * `?display=1` itself. Shown for tournaments (bracket) and leagues (schedule).
 */
export function DisplaysPanel({ event }: { event: EventDetailReadModel }) {
  const isTournament = event.type === 'tournament';
  const surface = isTournament ? 'bracket/watch' : 'schedule';
  const label = isTournament ? 'Bracket' : 'Schedule';
  const noun = isTournament ? 'bracket' : 'schedule';
  const multi = event.divisions.length > 1;

  const divisionRows = event.divisions.map((d) => ({
    key: d.id,
    title: multi ? `${label} — ${d.label}` : `${label} display`,
    path: multi
      ? `/events/${event.id}/${surface}?division=${d.id}&display=1`
      : `/events/${event.id}/${surface}?display=1`,
  }));
  // Venue-wide boards (all divisions at once) lead the list: the court board
  // ("what's on now / up next") and the all-divisions dashboard.
  const rows = [
    { key: 'courts', title: 'Courts — Now & Next', path: `/events/${event.id}/courts?display=1` },
    {
      key: 'dashboard',
      title: 'Dashboard — all divisions',
      path: `/events/${event.id}/dashboard?display=1`,
    },
    ...divisionRows,
  ];

  return (
    // Collapsible disclosure — the QR rows take a lot of vertical space, so the
    // panel ships collapsed by default and the host expands it when they're
    // setting up a screen. Native <details> keeps this a server component (the
    // QR rows are the only client bits). Mirrors the signup-section idiom.
    <details className="group border-border-base bg-fg/2 rounded-shape-sm border">
      <summary className="hover:bg-fg/5 flex cursor-pointer list-none items-start justify-between gap-3 p-4 select-none [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h3 className="text-fg text-sm font-semibold">Displays for TVs &amp; tablets</h3>
          <p className="text-muted text-xs">
            A full-screen, auto-updating {noun} to leave running on a screen at the venue. Scan the
            code to open it on a tablet, or copy the link.
          </p>
        </div>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="text-muted mt-0.5 h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </summary>
      <ul className="space-y-3 px-4 pb-4">
        {rows.map((r) => (
          <li key={r.key}>
            <DisplayLinkRow title={r.title} path={r.path} />
          </li>
        ))}
      </ul>
    </details>
  );
}
