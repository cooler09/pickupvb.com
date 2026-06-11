import Link from 'next/link';
import type { Route } from 'next';
import { guideMetadata } from '../help-meta';
import { GuidePage } from '../_components/guide-page';

export const metadata = guideMetadata('your-account');

export default function YourAccountGuide() {
  return (
    <GuidePage slug="your-account">
      <p>
        You can play without setting anything up, but a few minutes on your account makes signing up
        faster and helps you connect with other players.
      </p>

      <h2>Fill out your profile</h2>
      <p>
        Add your <strong>positions</strong> and <strong>skill level</strong> on your{' '}
        <Link href={'/profile' as Route}>profile</Link>. When an event uses positional sign-up, your
        positions are filled in for you, and an accurate skill level helps you find games at the
        right level. A photo and handle make you easier for teammates and friends to recognize.
      </p>

      <h2>Claim a guest sign-up</h2>
      <p>
        If you joined an event as a guest (just a name, no account), you can <strong>claim</strong>{' '}
        it to turn it into a real login. Claiming keeps the events you&rsquo;ve already joined
        attached to you and lets you add friends, get notifications, and manage everything from one
        place.
      </p>

      <h2>Add friends</h2>
      <p>
        Connect with people you play with. Friends make some events easier to discover — hosts can
        open an event to their friends, or to friends of people already going — so building your
        network surfaces more games.
      </p>

      <h2>Join groups</h2>
      <p>
        Clubs, leagues, and venues run as <Link href={'/groups' as Route}>groups</Link>. Joining the
        ones you play with keeps their events on your radar and gives you a shared identity when you
        play under them.
      </p>

      <h2>Notifications</h2>
      <p>
        Stay in the loop with reminders and host announcements by email, push, and in-app — useful
        for &ldquo;starting soon&rdquo; nudges and last-minute changes like a court move. You
        control what you receive from your settings.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          Ready to play? <Link href={'/help/find-and-join' as Route}>Find a game and join</Link>.
        </li>
        <li>
          Playing competitively?{' '}
          <Link href={'/help/teams-and-free-agents' as Route}>Play on a team</Link>.
        </li>
      </ul>
    </GuidePage>
  );
}
