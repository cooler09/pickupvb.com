import Link from 'next/link';
import type { Route } from 'next';
import { guideMetadata } from '../help-meta';
import { GuidePage } from '../_components/guide-page';

export const metadata = guideMetadata('getting-started');

// HowTo steps for the structured data — concise summaries of the <h2> sections
// below. Keep in sync with the headings when the guide changes.
const HOW_TO_STEPS = [
  {
    name: 'Pick an event type',
    text: 'Choose open play (individuals sign up), a tournament (teams compete in divisions with a bracket), or a league (rostered teams play a weekly schedule).',
  },
  {
    name: 'Create your event',
    text: 'Go to Host an event and set the surface, format, gender, skill level, venue, date, capacity, and price.',
  },
  {
    name: 'Publish it',
    text: 'Your event starts as a private draft; publish it when the details are right so players can see it and sign up.',
  },
  {
    name: 'Let capacity and the waitlist work',
    text: 'Spot counts update live; once you hit capacity new signups join a waitlist and are promoted automatically when someone drops out.',
  },
  {
    name: 'Share it and fill it',
    text: 'Public events show up in search and the home feed; share the link directly, or set the event to invite-only or friends to keep it private.',
  },
  {
    name: 'Manage signups',
    text: 'From the event page, view the roster, add co-hosts, and send broadcasts that reach every attendee by email, push, and in-app notification.',
  },
];

export default function GettingStartedGuide() {
  return (
    <GuidePage slug="getting-started" howToSteps={HOW_TO_STEPS}>
      <p>
        Hosting on PickupVB takes a few minutes: pick what kind of event you&rsquo;re running, fill
        in the details, and publish. Players find it, sign up, and you run it on game day. This
        guide walks the whole path.
      </p>

      <h2>1. Pick an event type</h2>
      <p>PickupVB has three kinds of events, and the type you choose shapes everything after it:</p>
      <ul>
        <li>
          <strong>Open play</strong> — a single session where individuals sign up. Capacity is by
          player count. The simplest place to start.
        </li>
        <li>
          <strong>Tournament</strong> — teams compete over one or more days, organized into
          divisions, with a bracket per division. Players without a team can join a free-agent pool.
        </li>
        <li>
          <strong>League</strong> — pre-rostered teams play a weekly schedule across a season, with
          standings and an optional playoff bracket at the end.
        </li>
      </ul>
      <p>
        Not sure yet? Open play is the fastest way to get your first event live. You can always run
        a tournament or league later — see{' '}
        <Link href={'/help/tournaments-and-brackets' as Route}>Run a tournament</Link> and{' '}
        <Link href={'/help/leagues' as Route}>Run a league</Link>.
      </p>

      <h2>2. Create your event</h2>
      <p>
        Head to <Link href={'/events/new' as Route}>Host an event</Link> and fill in the basics:
      </p>
      <ul>
        <li>
          <strong>What &amp; where</strong> — surface (indoor, grass, or sand), format (sixes,
          quads, triples, or doubles), gender, skill level, and the venue. Indoor allows sixes or
          quads; grass and sand allow any format.
        </li>
        <li>
          <strong>When</strong> — start time and, for multi-day tournaments or league seasons, an
          end date.
        </li>
        <li>
          <strong>Capacity</strong> — how many players (open play) or teams (tournament) you can
          take. Leave it open if there&rsquo;s no hard cap.
        </li>
        <li>
          <strong>Price</strong> — free events need no setup. To charge, see{' '}
          <Link href={'/help/getting-paid' as Route}>Get paid for your events</Link>.
        </li>
      </ul>

      <h2>3. Draft vs. published</h2>
      <p>
        A new event starts as a <strong>draft</strong> — only you can see it. Nothing is visible to
        players and no one can sign up until you <strong>publish</strong>. Use the draft stage to
        get the details right; publish when you&rsquo;re ready for signups. You can still edit most
        things after publishing.
      </p>

      <h2>4. Capacity and the waitlist</h2>
      <p>
        Spot counts update live for everyone viewing the event. When you hit capacity, new signups
        land on a <strong>waitlist</strong> instead of being turned away — and if someone drops out,
        the next person is promoted automatically. You don&rsquo;t have to manage the line by hand.
      </p>

      <h2>5. Share it and fill it</h2>
      <ul>
        <li>
          <strong>Public events</strong> show up in search and the home feed, sorted by distance, so
          nearby players discover them on their own.
        </li>
        <li>
          <strong>Want it private?</strong> Set the visibility to invite-only (reachable only by
          link) or limit it to your friends — handy for a closed group.
        </li>
        <li>
          <strong>Share the link</strong> anywhere — text, group chat, social. The fastest way to
          fill a first event is to invite a few people directly.
        </li>
      </ul>

      <h2>6. Manage signups</h2>
      <p>
        From the event page you can see the roster, add <strong>co-hosts</strong> (other people or a
        whole group who share edit and management access), and send a <strong>broadcast</strong> — a
        one-to-many announcement that reaches every attendee by email, push, and in-app
        notification.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          <Link href={'/help/getting-paid' as Route}>Get paid for your events</Link> — connect
          Stripe and start charging.
        </li>
        <li>
          <Link href={'/help/running-event-day' as Route}>Run your event on game day</Link> —
          scoreboard, displays, check-in.
        </li>
      </ul>
    </GuidePage>
  );
}
