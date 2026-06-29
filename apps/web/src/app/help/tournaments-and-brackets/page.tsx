import Link from 'next/link';
import type { Route } from 'next';
import { guideMetadata } from '../help-meta';
import { GuidePage } from '../_components/guide-page';

export const metadata = guideMetadata('tournaments-and-brackets');

// HowTo steps for the structured data — concise summaries of the <h2> sections
// below. Keep in sync with the headings when the guide changes.
const HOW_TO_STEPS = [
  {
    name: 'Set up divisions',
    text: 'Split the tournament into divisions by skill or format, each with its own capacity and bracket.',
  },
  {
    name: 'Choose how teams register',
    text: 'Pick a team-registration format so teams sign themselves up or you add them.',
  },
  {
    name: 'Open a free-agent pool',
    text: 'Let players without a team join a free-agent pool so a captain can pick them up.',
  },
  {
    name: 'Build the brackets',
    text: 'Create a bracket per division and seed the teams.',
  },
  {
    name: 'Score it live',
    text: 'Score matches live so the bracket advances winners automatically and spectators can follow along.',
  },
];

export default function TournamentsGuide() {
  return (
    <GuidePage slug="tournaments-and-brackets" howToSteps={HOW_TO_STEPS}>
      <p>
        A tournament is a team event organized into divisions, with a bracket per division. You keep
        full control over teams, rosters, and the schedule the whole way through. Here&rsquo;s how
        the pieces fit together.
      </p>

      <h2>Divisions</h2>
      <p>
        A tournament can have one division or many — for example separate skill tiers, or
        men&rsquo;s / women&rsquo;s / coed brackets. Each division has its own teams, its own
        free-agent pool, and its own bracket. Set these up on the event so players sign up into the
        right one.
      </p>

      <h2>How teams register</h2>
      <p>You choose how teams form for each division:</p>
      <ul>
        <li>
          <strong>Full team</strong> — a captain registers the whole roster at once.
        </li>
        <li>
          <strong>Partners</strong> — players sign up with the partner(s) they&rsquo;re bringing.
        </li>
        <li>
          <strong>Pair draw</strong> — players register individually and are paired up.
        </li>
      </ul>
      <p>
        You can also add or edit teams yourself at any time and handle <strong>walk-ins</strong> on
        the day — useful when a team shows up unregistered or you need to balance the field.
      </p>

      <h2>Free agents</h2>
      <p>
        Players without a team can join a division&rsquo;s <strong>free-agent pool</strong> so
        captains (or you) can pick them up. It&rsquo;s a per-division toggle, so you can open it
        where you expect solo signups and leave it off elsewhere.
      </p>

      <h2>Brackets</h2>
      <p>Once teams are in, generate a bracket for each division. The formats:</p>
      <ul>
        <li>
          <strong>Single elimination</strong> — lose once and you&rsquo;re out; top seeds can get
          first-round byes.
        </li>
        <li>
          <strong>Double elimination</strong> — a winners and a losers side, so a team has to lose
          twice to be eliminated.
        </li>
        <li>
          <strong>Round robin</strong> — everyone plays everyone; rank by record.
        </li>
        <li>
          <strong>Pool play → playoff</strong> — group stage first, then a bracket from the top
          finishers.
        </li>
      </ul>
      <p>
        Seeding feeds the matchups; results advance teams automatically, and the bracket enforces
        the rules (you can&rsquo;t report a match that isn&rsquo;t ready or skip a round), so the
        standings always stay consistent.
      </p>

      <h2>Scoring it live</h2>
      <p>
        Report scores as matches finish and the bracket advances on its own. Pair this with the live
        scoreboard and a big-screen display for the gym — see{' '}
        <Link href={'/help/running-event-day' as Route}>Run your event on game day</Link>.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          Haven&rsquo;t made an event yet?{' '}
          <Link href={'/help/getting-started' as Route}>Host your first event</Link>.
        </li>
        <li>
          Charging entry? <Link href={'/help/getting-paid' as Route}>Get paid for your events</Link>
          .
        </li>
        <li>
          Running a weekly season instead? <Link href={'/help/leagues' as Route}>Run a league</Link>
          .
        </li>
      </ul>
    </GuidePage>
  );
}
