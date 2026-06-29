import Link from 'next/link';
import type { Route } from 'next';
import { guideMetadata } from '../help-meta';
import { GuidePage } from '../_components/guide-page';

export const metadata = guideMetadata('leagues');

// HowTo steps for the structured data — concise summaries of the <h2> sections
// below. Keep in sync with the headings when the guide changes.
const HOW_TO_STEPS = [
  {
    name: 'Add rostered teams',
    text: 'Set up the pre-rostered teams that will play the season.',
  },
  {
    name: 'Group teams into divisions',
    text: 'For a larger league, split teams into divisions.',
  },
  {
    name: 'Generate the weekly schedule',
    text: 'Build a weekly match schedule across the season.',
  },
  {
    name: 'Track standings and playoffs',
    text: 'Standings update automatically; add an optional end-of-season playoff bracket.',
  },
  {
    name: 'Collect league fees',
    text: 'Charge a league fee per team or per player through the same payment flow as events.',
  },
];

export default function LeaguesGuide() {
  return (
    <GuidePage slug="leagues" howToSteps={HOW_TO_STEPS}>
      <p>
        A league is a season: pre-rostered teams play a weekly schedule, you track standings, and
        the season can finish with a playoff bracket. It reuses the tournament building blocks, with
        a few league-specific pieces.
      </p>

      <h2>Rostered teams</h2>
      <p>
        Unlike a tournament&rsquo;s pickup teams, a league runs on{' '}
        <strong>pre-defined rostered teams</strong> — a set lineup that plays together all season.
        Each division uses rostered teams, and you keep full control to add, edit, or fix rosters as
        the season goes.
      </p>

      <h2>Divisions</h2>
      <p>
        Split the league by skill tier and play type the same way a tournament does. Every division
        runs its own schedule, standings, and (optional) playoff.
      </p>

      <h2>The weekly schedule</h2>
      <p>
        Build the season&rsquo;s fixtures — which teams play which week. Players and teams see their
        upcoming matchups, and you can edit the schedule whenever you need to (rain-outs, makeups,
        re-seeding). Results roll up into standings automatically.
      </p>

      <h2>Standings &amp; playoffs</h2>
      <p>
        As scores come in, standings update so everyone can see where they sit. At the end of the
        season you can optionally generate a <strong>playoff bracket</strong> per division from the
        standings — see{' '}
        <Link href={'/help/tournaments-and-brackets' as Route}>Run a tournament</Link> for how
        brackets work.
      </p>

      <h2>How leagues are paid</h2>
      <p>
        Leagues are billed as a <strong>one-time season fee</strong> paid up front — there&rsquo;s
        no recurring monthly billing for a league. Setup is the same as any paid event; see{' '}
        <Link href={'/help/getting-paid' as Route}>Get paid for your events</Link> to connect Stripe
        and choose who covers the platform fee.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          New to hosting? <Link href={'/help/getting-started' as Route}>Host your first event</Link>
          .
        </li>
        <li>
          On game night, run the scoreboard and displays —{' '}
          <Link href={'/help/running-event-day' as Route}>Run your event on game day</Link>.
        </li>
      </ul>
    </GuidePage>
  );
}
