import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { JsonLd } from '@/components/json-ld';
import { SeedingTool } from './_components/seeding.js';
import { parseEventBinding } from '../_lib/event-binding';
import { loadEventToolContext } from '../_lib/load-event-tool-context';

/**
 * SEO-facing landing page for the free seeding generator. The interactive tool
 * is a small client island (`_components/seeding.tsx`) so the page stays a
 * server component and exports real metadata + JSON-LD. Backend-free — the
 * roster never leaves the browser — matching the other host tools.
 */
export const metadata: Metadata = {
  title: 'Free seeding generator — rank & pool teams for a bracket',
  description:
    'Free, no-signup seeding generator. Paste your teams and rank them, draw random seeds, or snake them into balanced pools for a bracket. Works for volleyball, pickleball — any sport. Nothing is saved.',
  alternates: { canonical: '/tools/seeding' },
  keywords: [
    'seeding generator',
    'tournament seeding',
    'bracket seeding',
    'snake seeding',
    'pool seeding',
    'random seed draw',
    'volleyball seeding',
  ],
  openGraph: {
    title: 'Free seeding generator',
    description:
      'Rank teams, draw random seeds, or snake them into balanced pools. No account, no install.',
    url: '/tools/seeding',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free seeding generator',
    description: 'Rank, randomize, or snake teams into pools. No signup.',
  },
};

const faqs = [
  {
    q: 'Do I need an account?',
    a: 'No. The seeding generator is a free utility — no signup, no install, no payment.',
  },
  {
    q: 'How does ranked seeding work?',
    a: 'Add a rating after each team (e.g. "Sharks 9") and pick Ranked. Teams are ordered strongest first; ties and unrated teams keep the order you entered them.',
  },
  {
    q: 'What is snake seeding into pools?',
    a: 'Set more than one pool and the seeds are dealt in a snake — seed 1 to pool A, seed 2 to pool B, then back — so every pool gets a comparable mix of strong and weak teams.',
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
      name: 'PickupVB Seeding Generator',
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Any (browser)',
      url: 'https://pickupvb.com/tools/seeding',
      description:
        'Free, no-signup seeding generator. Rank teams, draw random seeds, or snake them into balanced pools.',
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

export default async function SeedingPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Bound to an event division (tournament-tools-workflow audit TT-2): pull the
  // division's registered teams and let the host apply the computed seed order
  // to the bracket. Unbound, it's the plain free tool and reads no cookies.
  const binding = parseEventBinding(await props.searchParams);
  const ctx = binding ? await loadEventToolContext(binding) : null;
  const islandProps =
    ctx && ctx.divisionId
      ? {
          initialRoster: ctx.teams.map((t) => t.name).join('\n'),
          boundTeams: ctx.teams,
          eventBinding: {
            eventId: ctx.binding.eventId,
            divisionId: ctx.divisionId,
            ret: ctx.binding.ret,
            eventTitle: ctx.eventTitle,
            ...(ctx.divisionLabel ? { divisionLabel: ctx.divisionLabel } : {}),
          },
        }
      : {};

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <JsonLd data={jsonLd} />
      <BreadcrumbJsonLd
        trail={[
          { name: 'Host tools', path: '/tools' },
          { name: 'Seeding generator', path: '/tools/seeding' },
        ]}
      />

      <header className="space-y-1">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Host tool · Free
        </p>
        <h1 className="text-headline-lg font-bold">Seeding generator</h1>
        <p className="text-muted text-sm">
          Paste your teams and seed them for a bracket — ranked by rating or a random draw — then
          optionally snake them into balanced pools. Nothing is saved.
        </p>
      </header>

      <SeedingTool {...islandProps} />

      <div className="text-muted border-border-base rounded-md border border-dashed p-4 text-xs">
        <p className="text-fg font-medium">How it works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Paste teams, one per line. Optionally add a rating (e.g. &ldquo;Sharks 9&rdquo;).</li>
          <li>Seed by rating (Ranked) or draw at random.</li>
          <li>Set the number of pools to snake the seeds into balanced groups.</li>
          <li>Copy the result to share it anywhere.</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h2 className="text-fg text-title-lg font-semibold">FAQ</h2>
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
