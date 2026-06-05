import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next';
import { secondaryButtonClass } from '@/components/primary-button';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { JsonLd } from '@/components/json-ld';
import { StandingsSetupForm } from './_components/setup-form.js';
import { EventBindingBanner } from '../_components/event-binding-banner';
import { parseEventBinding } from '../_lib/event-binding';
import { loadEventToolContext } from '../_lib/load-event-tool-context';

/**
 * SEO-facing landing page for the free win/loss standings tracker. The start
 * button is a small client island (`_components/setup-form.tsx`) so the page
 * stays a server component and exports real metadata + JSON-LD. Ephemeral
 * standings rooms under `/tools/standings/[code]` stay `noindex` (robots.ts) —
 * only this entry page is advertised, like the other room tools.
 */
export const metadata: Metadata = {
  title: 'Free standings tracker — win/loss table with tiebreakers',
  description:
    'Free, no-signup standings tracker for round-robin and pool play. Record results and get a live win/loss table with automatic tiebreakers (head-to-head, point differential). Share a link so everyone sees the same standings. Nothing is saved.',
  alternates: { canonical: '/tools/standings' },
  keywords: [
    'standings tracker',
    'win loss tracker',
    'round robin standings',
    'pool play standings',
    'league table generator',
    'tournament standings',
    'volleyball standings',
  ],
  openGraph: {
    title: 'Free standings tracker — win/loss with tiebreakers',
    description:
      'Record results and get a live standings table with automatic tiebreakers. Shared across devices. No account, no install.',
    url: '/tools/standings',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free standings tracker',
    description: 'Live win/loss table with automatic tiebreakers. No signup.',
  },
};

const faqs = [
  {
    q: 'Do I need an account?',
    a: 'No. The standings tracker is a free utility — no signup, no install, no payment.',
  },
  {
    q: 'How are ties in the standings broken?',
    a: 'Automatically, in order: most wins, then head-to-head record among the tied teams, then point differential, then total points scored, then name.',
  },
  {
    q: 'Can everyone update the table?',
    a: 'Yes. Each room gets a short code — share the link and every device shows the same standings in real time, so anyone can record a result from their phone.',
  },
  {
    q: 'Is anything saved?',
    a: 'No. The table lives only on the connected devices and a Supabase Realtime channel with nothing at rest. It auto-clears after 24h of inactivity.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'PickupVB Standings Tracker',
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Any (browser)',
      url: 'https://pickupvb.com/tools/standings',
      description:
        'Free, no-signup win/loss standings tracker with automatic tiebreakers for round-robin and pool play.',
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

export default async function StandingsSetupPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Bound to an event division (tournament-tools-workflow audit TT-2/TT-4): the
  // room opens pre-seeded with the division's teams, and the host is pointed to
  // the event's podium panel to record the final placements (the canonical
  // surface — it resolves the correct team entry ids; this tool is a feeder).
  const binding = parseEventBinding(await props.searchParams);
  const ctx = binding ? await loadEventToolContext(binding) : null;
  const teamNames = ctx?.teams.map((t) => t.name) ?? [];

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <JsonLd data={jsonLd} />
      <BreadcrumbJsonLd
        trail={[
          { name: 'Host tools', path: '/tools' },
          { name: 'Win/loss standings', path: '/tools/standings' },
        ]}
      />

      {ctx ? (
        <EventBindingBanner
          eventTitle={ctx.eventTitle}
          {...(ctx.divisionLabel ? { divisionLabel: ctx.divisionLabel } : {})}
          ret={ctx.binding.ret}
        >
          <Link
            href={`/events/${ctx.binding.eventId}/manage` as Route}
            className={secondaryButtonClass('sm')}
          >
            Record podium →
          </Link>
        </EventBindingBanner>
      ) : null}

      <header className="space-y-1">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Host tool · Free
        </p>
        <h1 className="text-3xl font-bold">Standings tracker</h1>
        <p className="text-muted text-sm">
          Record results and get a live win/loss table with automatic tiebreakers — head-to-head,
          then point differential. Share a link so everyone sees the same standings. Pairs with the
          round-robin scheduler. Nothing is saved.
        </p>
      </header>

      <StandingsSetupForm initialTeams={teamNames} />

      <div className="text-muted border-border-base rounded-md border border-dashed p-4 text-xs">
        <p className="text-fg font-medium">How it works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Start a room and add your teams.</li>
          <li>Record each game&rsquo;s score — the table updates instantly.</li>
          <li>Ties break automatically: head-to-head, then point differential.</li>
          <li>Share the link so anyone can record results from their phone.</li>
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
