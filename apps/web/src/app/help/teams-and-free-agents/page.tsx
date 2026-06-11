import Link from 'next/link';
import type { Route } from 'next';
import { guideMetadata } from '../help-meta';
import { GuidePage } from '../_components/guide-page';

export const metadata = guideMetadata('teams-and-free-agents');

export default function TeamsGuide() {
  return (
    <GuidePage slug="teams-and-free-agents">
      <p>
        Tournaments and leagues are played by teams. Whether you have a crew already or you&rsquo;re
        rolling up solo, there&rsquo;s a way in.
      </p>

      <h2>Sign up with your team</h2>
      <p>How teams form depends on what the host chose for that event:</p>
      <ul>
        <li>
          <strong>Full team</strong> — one person (the captain) registers the whole roster.
        </li>
        <li>
          <strong>Partners</strong> — you sign up together with the partner(s) you&rsquo;re
          bringing.
        </li>
        <li>
          <strong>Pair draw</strong> — you register on your own and get paired up.
        </li>
      </ul>
      <p>The event page tells you which one applies and walks you through signing up.</p>

      <h2>No team? Join the free-agent pool</h2>
      <p>
        If you don&rsquo;t have a team for a tournament, register as a <strong>free agent</strong>.
        You go into a pool for that division so a captain (or the host) can pick you up onto a team.
        It&rsquo;s the easiest way to get into a competitive event when you&rsquo;re flying solo.
      </p>

      <h2>Standing teams</h2>
      <p>
        You can also create a <strong>persistent team</strong> with its own page — handy if you play
        together regularly. A team has a captain, members, and can sign up for events together and
        send its own announcements. Start one from the{' '}
        <Link href={'/teams' as Route}>teams area</Link>.
      </p>

      <h2>During the event</h2>
      <p>
        Once teams are set, the host runs the bracket or league schedule and reports results — you
        just see your matchups and where your team stands. The host can adjust rosters and handle
        walk-ins on the day if something changes.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          Haven&rsquo;t found an event yet?{' '}
          <Link href={'/help/find-and-join' as Route}>Find a game and join</Link>.
        </li>
        <li>
          There&rsquo;s an entry fee?{' '}
          <Link href={'/help/paying-for-events' as Route}>Pay for an event</Link>.
        </li>
      </ul>
    </GuidePage>
  );
}
