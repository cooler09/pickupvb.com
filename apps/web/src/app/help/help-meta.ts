/**
 * Single source of truth for the `/help` guides — slug, title, one-line
 * description, audience, sort order, and the "last updated" date. Consumed by
 * the hub ([page.tsx](page.tsx)), each guide's `metadata` + `<h1>`, and the
 * sitemap (so `lastModified` reflects the real document date, not build time).
 * Mirrors the legal section's [legal-meta.ts](../legal/legal-meta.ts).
 *
 * To add a guide: append an entry here, then create
 * `apps/web/src/app/help/<slug>/page.tsx`. The hub picks it up automatically.
 * Player-track guides drop in the same way (set `audience: 'player'`).
 */

import type { Metadata } from 'next';

export type HelpAudience = 'host' | 'player';

export type HelpGuideMeta = {
  /** URL segment under `/help/` and the stable id used everywhere else. */
  slug: string;
  /** Page `<h1>` and the `%s` in the title template (`%s · PickupVB`). */
  title: string;
  /** SEO meta description and the hub card blurb — keep it one sentence. */
  description: string;
  /** Which onboarding track this guide belongs to. */
  audience: HelpAudience;
  /** Sort order within the hub section (ascending). */
  order: number;
  /** Display date; also feeds the sitemap `lastModified`. Bump on a real edit. */
  lastUpdated: string;
};

export const HELP_GUIDES = [
  {
    slug: 'getting-started',
    title: 'Host your first event',
    description:
      'Create, publish, and fill your first pickup volleyball event — from picking an event type to managing signups.',
    audience: 'host',
    order: 1,
    lastUpdated: 'June 11, 2026',
  },
  {
    slug: 'getting-paid',
    title: 'Get paid for your events',
    description:
      'Connect Stripe, understand the platform fee, take tips, handle refunds, and route payouts to yourself or your club.',
    audience: 'host',
    order: 2,
    lastUpdated: 'June 11, 2026',
  },
  {
    slug: 'tournaments-and-brackets',
    title: 'Run a tournament',
    description:
      'Set up divisions, pick a team-registration format, open a free-agent pool, and run brackets with live scoring.',
    audience: 'host',
    order: 3,
    lastUpdated: 'June 11, 2026',
  },
  {
    slug: 'leagues',
    title: 'Run a league',
    description:
      'Build a season with rostered teams, a weekly schedule, standings, and an optional end-of-season playoff bracket.',
    audience: 'host',
    order: 4,
    lastUpdated: 'June 11, 2026',
  },
  {
    slug: 'running-event-day',
    title: 'Run your event on game day',
    description:
      'Use the live scoreboard, gym display mode, broadcasts, waivers, and check-in to run a smooth event day.',
    audience: 'host',
    order: 5,
    lastUpdated: 'June 11, 2026',
  },
  {
    slug: 'find-and-join',
    title: 'Find a game and join',
    description:
      'Discover events near you, RSVP, understand the waitlist, and sign up with or without an account.',
    audience: 'player',
    order: 1,
    lastUpdated: 'June 11, 2026',
  },
  {
    slug: 'paying-for-events',
    title: 'Pay for an event',
    description:
      'How checkout works, what the fee is, refunds when you leave, tipping the host, and using passes or a membership.',
    audience: 'player',
    order: 2,
    lastUpdated: 'June 11, 2026',
  },
  {
    slug: 'teams-and-free-agents',
    title: 'Play on a team',
    description:
      'Join or start a team, sign up with a partner, or jump into a free-agent pool so a captain can pick you up.',
    audience: 'player',
    order: 3,
    lastUpdated: 'June 11, 2026',
  },
  {
    slug: 'your-account',
    title: 'Your account & profile',
    description:
      'Fill out your profile, claim a guest sign-up, add friends, join groups, and manage notifications.',
    audience: 'player',
    order: 4,
    lastUpdated: 'June 11, 2026',
  },
] as const satisfies readonly HelpGuideMeta[];

export type HelpSlug = (typeof HELP_GUIDES)[number]['slug'];

/** Look up a guide entry by slug. Throws if the slug is unknown (caught at build). */
export function helpGuide(slug: HelpSlug): HelpGuideMeta {
  const found = HELP_GUIDES.find((g) => g.slug === slug);
  if (!found) throw new Error(`Unknown help guide slug: ${slug}`);
  return found;
}

/** Guides for one audience, in display order. */
export function helpGuidesFor(audience: HelpAudience): HelpGuideMeta[] {
  return HELP_GUIDES.filter((g) => g.audience === audience).sort((a, b) => a.order - b.order);
}

/** Parse a guide's display date into a `Date` for the sitemap `lastModified`. */
export function helpLastUpdatedDate(slug: HelpSlug): Date {
  return new Date(helpGuide(slug).lastUpdated);
}

/**
 * Page `metadata` for a guide, derived from its catalog entry so the SEO title /
 * description / canonical can't drift from the hub card. The title template
 * (`%s · PickupVB`, root layout) appends the brand for `<title>`, but openGraph
 * ignores the template, so it carries the brand explicitly.
 */
export function guideMetadata(slug: HelpSlug): Metadata {
  const guide = helpGuide(slug);
  const url = `/help/${guide.slug}`;
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${guide.title} · PickupVB`,
      description: guide.description,
      url,
      type: 'article',
    },
  };
}
