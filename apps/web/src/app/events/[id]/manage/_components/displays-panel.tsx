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

  const rows = event.divisions.map((d) => ({
    key: d.id,
    title: multi ? `${label} — ${d.label}` : `${label} display`,
    path: multi
      ? `/events/${event.id}/${surface}?division=${d.id}&display=1`
      : `/events/${event.id}/${surface}?display=1`,
  }));

  return (
    <div className="border-border-base bg-fg/[0.02] rounded-shape-sm space-y-3 border p-4">
      <div>
        <h3 className="text-fg text-sm font-semibold">Displays for TVs &amp; tablets</h3>
        <p className="text-muted text-xs">
          A full-screen, auto-updating {noun} to leave running on a screen at the venue. Scan the
          code to open it on a tablet, or copy the link.
        </p>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.key}>
            <DisplayLinkRow title={r.title} path={r.path} />
          </li>
        ))}
      </ul>
    </div>
  );
}
