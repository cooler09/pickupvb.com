import Link from 'next/link';
import type { Route } from 'next';
import { guideMetadata } from '../help-meta';
import { GuidePage } from '../_components/guide-page';

export const metadata = guideMetadata('find-and-join');

export default function FindAndJoinGuide() {
  return (
    <GuidePage slug="find-and-join">
      <p>
        The whole point of PickupVB is getting you into a game. Here&rsquo;s how to find one near
        you, sign up, and make sure you keep your spot.
      </p>

      <h2>Find a game</h2>
      <ul>
        <li>
          <strong>Browse events</strong> — the <Link href={'/events' as Route}>events page</Link>{' '}
          lists what&rsquo;s out there. The home feed sorts public events by distance, so the
          closest games surface first.
        </li>
        <li>
          <strong>Near me</strong> — tap the &ldquo;Near me&rdquo; button to use your location and
          see what&rsquo;s closest.
        </li>
        <li>
          <strong>Filter</strong> — narrow by surface (indoor, grass, sand), format, skill level,
          and date to find a game that fits you.
        </li>
      </ul>

      <h2>RSVP</h2>
      <p>
        Found one? Hit <strong>sign up</strong> on the event page. Spot counts update live, so you
        always see how many places are left. For free events that&rsquo;s all there is to it — for
        paid events you check out first (see{' '}
        <Link href={'/help/paying-for-events' as Route}>Pay for an event</Link>).
      </p>

      <h2>If it&rsquo;s full: the waitlist</h2>
      <p>
        When an event hits capacity, signing up puts you on the <strong>waitlist</strong> instead of
        turning you away. If someone drops out, the next person on the list is promoted{' '}
        <strong>automatically</strong> — so it&rsquo;s always worth joining the waitlist for a game
        you want.
      </p>

      <h2>Picking a position</h2>
      <p>
        Some open-play events let you sign up for a specific position (setter, outside, middle,
        libero, and so on). If the host turned that on, choose where you want to play — it defaults
        to the positions on your profile, so setting those once saves you time. See{' '}
        <Link href={'/help/your-account' as Route}>Your account &amp; profile</Link>.
      </p>

      <h2>Signing up without an account</h2>
      <p>
        You don&rsquo;t need to create an account to join a game — you can sign up as a{' '}
        <strong>guest</strong> with just your name. If you decide to stick around, you can{' '}
        <strong>claim</strong> that guest sign-up later to turn it into a real login and keep your
        history. More in{' '}
        <Link href={'/help/your-account' as Route}>Your account &amp; profile</Link>.
      </p>

      <h2>Leaving an event</h2>
      <p>
        Plans change — you can drop out from the event page, which frees your spot for the next
        person. If it was a paid event, whether you&rsquo;re refunded depends on the host&rsquo;s
        refund window; see <Link href={'/help/paying-for-events' as Route}>Pay for an event</Link>.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          Playing with others?{' '}
          <Link href={'/help/teams-and-free-agents' as Route}>Play on a team</Link>.
        </li>
        <li>
          Set yourself up:{' '}
          <Link href={'/help/your-account' as Route}>Your account &amp; profile</Link>.
        </li>
      </ul>
    </GuidePage>
  );
}
