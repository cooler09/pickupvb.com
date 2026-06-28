import { IS_PROD_HOST, PROD_APP_URL } from '@/lib/app-url';
import { HELP_GUIDES } from '../help/help-meta';

/**
 * `/llms.txt` — a machine-readable site guide for AI assistants, following the
 * llmstxt.org convention. It complements, rather than duplicates, the other two
 * crawler signals: robots.txt gates *crawling* and the sitemap enumerates *every*
 * indexable URL, whereas llms.txt is a short, curated map that tells an LLM what
 * PickupVB is and points it at the handful of canonical, high-signal pages worth
 * reading to answer a user's question.
 *
 * Built from the same `HELP_GUIDES` catalog the /help hub + sitemap consume, so
 * the guide list can't drift. Links are pinned to PROD_APP_URL (the canonical
 * origin) like our JSON-LD `@id`s. Served as static text, revalidated daily.
 *
 * The folder is literally named `llms.txt`, so Next serves this handler at
 * `/llms.txt`.
 */
export const dynamic = 'force-static';
export const revalidate = 86400;

const TXT = 'text/plain; charset=utf-8';

function link(path: string, title: string, desc: string): string {
  return `- [${title}](${PROD_APP_URL}${path}): ${desc}`;
}

export function GET(): Response {
  // Non-production deployments don't advertise a content map (robots.txt also
  // disallows everything there).
  if (!IS_PROD_HOST) {
    const stub = `# PickupVB\n\n> Non-production environment. The canonical llms.txt lives at ${PROD_APP_URL}/llms.txt\n`;
    return new Response(stub, { headers: { 'content-type': TXT } });
  }

  const guides = HELP_GUIDES.map((g) => link(`/help/${g.slug}`, g.title, g.description)).join('\n');

  const body = `# PickupVB

> PickupVB is a free platform to discover, host, and join pickup volleyball events — indoor, grass, and beach — including open play, leagues, and tournaments. Players find games near them and RSVP; hosts create events, take signups and payments, run brackets and leagues, and manage game day.

PickupVB covers the whole lifecycle of a pickup volleyball game: discovery (search by location, surface, format, skill level, and date), registration (individual signups, partner/team registration, free-agent pools, capacity waitlists), payments (free or paid events via Stripe, tips, passes, memberships), and game-day operations (live scoreboard, brackets, league schedules, standings, and gym display mode). It is free to use; an optional Pro tier unlocks extra host features.

## Key pages

${link('/', 'Home', 'What PickupVB is and the fastest way to find or host a game.')}
${link('/events', 'Find events', 'Browse and search public pickup volleyball events near you by location, surface, format, skill, and date.')}
${link('/community', 'Community calendar', 'Aggregated public volleyball events from around the web, beyond those hosted on PickupVB.')}
${link('/groups', 'Groups', 'Recurring communities and clubs that organize events together.')}
${link('/teams', 'Teams', 'Public team profiles.')}
${link('/players', 'Players', 'Public profiles for players who opted into discovery.')}
${link('/pricing', 'Pricing', 'The free tier and what the optional Pro tier adds for hosts.')}

## Help & guides

${guides}

## Free tools (no account required)

${link('/tools', 'Host tools', 'Free, no-signup volleyball utilities for running open gym and tournaments.')}
${link('/tools/scoreboard', 'Scoreboard', 'Shareable live volleyball scoreboard.')}
${link('/tools/rotation', 'Court rotation queue', 'King-of-the-court next-up queue for open gym.')}
${link('/tools/timer', 'Game timer', 'Shared match / round timer.')}
${link('/tools/standings', 'Standings', 'Quick pool-play standings tracker.')}
${link('/tools/team-randomizer', 'Team randomizer', 'Split players into balanced random teams.')}
${link('/tools/scheduler', 'Round-robin scheduler', 'Generate a round-robin match schedule.')}
${link('/tools/seeding', 'Bracket seeding', 'Seed teams into a tournament bracket.')}

## Legal

${link('/legal/terms', 'Terms of Service', 'Terms governing use of PickupVB.')}
${link('/legal/privacy', 'Privacy Policy', 'How PickupVB handles personal data.')}
${link('/legal/refunds', 'Refund Policy', 'How refunds work for paid events.')}
${link('/legal/accessibility', 'Accessibility', 'PickupVB accessibility commitment.')}
`;

  return new Response(body, { headers: { 'content-type': TXT } });
}
