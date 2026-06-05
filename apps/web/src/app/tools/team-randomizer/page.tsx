import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { TeamRandomizer } from './_components/randomizer.js';
import { parseEventBinding } from '../_lib/event-binding';
import { loadEventToolContext } from '../_lib/load-event-tool-context';

/**
 * SEO-facing landing page for the free team randomizer. The interactive
 * splitter is a small client island (`_components/randomizer.tsx`) so the page
 * itself stays a server component and exports real metadata + JSON-LD that
 * crawlers and link-previewers can index. The tool is backend-free — the
 * roster never leaves the browser — matching the no-signup posture of the
 * scoreboard tool.
 */
export const metadata: Metadata = {
  title: 'Free team randomizer — split players into balanced teams',
  description:
    'Free, no-signup team generator for pickup games. Paste a roster and split players into random or skill-balanced teams in one tap. Works for volleyball, basketball, soccer — any sport. Nothing is saved.',
  alternates: { canonical: '/tools/team-randomizer' },
  keywords: [
    'team randomizer',
    'team generator',
    'random team picker',
    'balanced team maker',
    'split players into teams',
    'pickup game teams',
    'volleyball team generator',
  ],
  openGraph: {
    title: 'Free team randomizer — split players into balanced teams',
    description:
      'Paste a roster and split players into random or skill-balanced teams in one tap. No account, no install.',
    url: '/tools/team-randomizer',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free team randomizer',
    description: 'Split players into random or balanced teams in one tap. No signup.',
  },
};

const faqs = [
  {
    q: 'Do I need an account?',
    a: 'No. The team randomizer is a free utility — no signup, no install, no payment.',
  },
  {
    q: 'How do I make balanced teams?',
    a: 'Add a skill rating after each name (e.g. "Alex 5"), then pick Balanced. The tool snake-drafts by rating so both head-count and total skill are spread evenly across teams.',
  },
  {
    q: 'What sports does it work for?',
    a: 'Any. It just splits a list of names into teams, so it works for volleyball, basketball, soccer, board-game nights — anything.',
  },
  {
    q: 'Is my roster saved anywhere?',
    a: 'No. Everything stays in your browser. Nothing is sent to our servers or saved.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'PickupVB Team Randomizer',
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Any (browser)',
      url: 'https://pickupvb.com/tools/team-randomizer',
      description:
        'Free, no-signup team generator. Paste a roster and split players into random or skill-balanced teams.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
};

export default async function TeamRandomizerPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // When launched from an event (tournament-tools-workflow audit TT-2) the page
  // pulls the event's attendee roster and lets the host save the split as ad-hoc
  // teams. Unbound (no/invalid `?event=`), it's the plain free tool — and never
  // reads cookies, so it stays statically cacheable.
  const binding = parseEventBinding(await props.searchParams);
  const ctx = binding ? await loadEventToolContext(binding) : null;
  const islandProps = ctx
    ? {
        initialRoster: ctx.rosterNames.join('\n'),
        eventBinding: {
          eventId: ctx.binding.eventId,
          ret: ctx.binding.ret,
          eventTitle: ctx.eventTitle,
        },
        adHocDivisions: ctx.adHocDivisions,
      }
    : {};

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <script
        type="application/ld+json"
        // Static, server-rendered JSON — safe to inline.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BreadcrumbJsonLd
        trail={[
          { name: 'Host tools', path: '/tools' },
          { name: 'Team randomizer', path: '/tools/team-randomizer' },
        ]}
      />

      <header className="space-y-1">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Host tool · Free
        </p>
        <h1 className="text-3xl font-bold">Team randomizer</h1>
        <p className="text-muted text-sm">
          Paste your roster and split everyone into fair teams in one tap. Add a skill rating after
          a name to balance by ability. Nothing is saved — the roster stays in your browser.
        </p>
      </header>

      <TeamRandomizer {...islandProps} />

      <div className="text-muted border-border-base rounded-md border border-dashed p-4 text-xs">
        <p className="text-fg font-medium">How it works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Paste names, one per line. Optionally add a skill rating (e.g. &ldquo;Alex 5&rdquo;).
          </li>
          <li>Pick how many teams and whether to split randomly or balance by skill.</li>
          <li>Tap &ldquo;Make teams&rdquo; — reshuffle as many times as you like.</li>
          <li>Copy the result to share it anywhere.</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h2 className="text-fg text-xl font-semibold">FAQ</h2>
        <dl className="space-y-3">
          {faqs.map((f) => (
            <div key={f.q} className="border-border-base rounded-md border p-3">
              <dt className="text-fg text-sm font-medium">{f.q}</dt>
              <dd className="text-muted mt-1 text-sm">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
