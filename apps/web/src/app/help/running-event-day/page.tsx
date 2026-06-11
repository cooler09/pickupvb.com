import Link from 'next/link';
import type { Route } from 'next';
import { guideMetadata } from '../help-meta';
import { GuidePage } from '../_components/guide-page';

export const metadata = guideMetadata('running-event-day');

export default function EventDayGuide() {
  return (
    <GuidePage slug="running-event-day">
      <p>
        The event is published and players are signed up — now you run it. PickupVB gives you tools
        for the gym floor and a few ways to keep everyone in the loop on the day.
      </p>

      <h2>Free host tools</h2>
      <p>
        The <Link href={'/tools' as Route}>host tools</Link> work on any device, and most need no
        account:
      </p>
      <ul>
        <li>
          <strong>Live scoreboard</strong> — a full-screen score tracker with a shareable phone
          remote, synced live across devices.
        </li>
        <li>
          <strong>Timer, rotation, and standings</strong> — keep games on schedule, track serving
          rotation, and show the table.
        </li>
        <li>
          <strong>Team randomizer &amp; seeding</strong> — split a roster into balanced teams or set
          seeds in a tap.
        </li>
      </ul>

      <h2>Put it on the big screen</h2>
      <p>
        For tournaments and leagues, Pro hosts can open a full-screen <strong>display mode</strong>{' '}
        — a clean, auto-refreshing view of the bracket, schedule, or a by-court board built for a
        gym TV or tablet. Bind the live scoreboard to a scheduled match and scores show up on the
        display in real time. The display hub gives you a QR code so players can pull it up on their
        phones too.
      </p>

      <h2>Keep attendees informed</h2>
      <p>
        Send a <strong>broadcast</strong> from the event to reach every attendee at once — by email,
        push, and in-app notification. It&rsquo;s the right tool for &ldquo;courts moved to the back
        gym&rdquo; or &ldquo;first serve pushed 30 minutes.&rdquo;
      </p>

      <h2>Waivers</h2>
      <p>
        You can attach a <strong>waiver</strong> to an event — a link to your own waiver and/or
        pasted rules — and attendees acknowledge it online (type their name and agree). It&rsquo;s a
        soft tool: it never blocks sign-up, but it surfaces the rules and tracks who&rsquo;s
        acknowledged them. It isn&rsquo;t a substitute for whatever legal waiver your insurer or
        sanctioning body requires.
      </p>

      <h2>Check-in</h2>
      <p>
        The roster on the event page is your check-in sheet — see who&rsquo;s coming, manage the
        waitlist, and handle day-of changes. Add a co-host if you want help running the desk.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          <Link href={'/help/tournaments-and-brackets' as Route}>Run a tournament</Link> — divisions
          and brackets.
        </li>
        <li>
          <Link href={'/help/leagues' as Route}>Run a league</Link> — seasons and standings.
        </li>
      </ul>
    </GuidePage>
  );
}
