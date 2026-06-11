import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next';
import { helpGuidesFor, type HelpAudience, type HelpGuideMeta } from './help-meta';

export const metadata: Metadata = {
  title: 'Help & guides',
  description:
    'How-to guides for running pickup volleyball on PickupVB: host your first event, get paid, run tournaments and leagues, and run a smooth event day.',
  alternates: { canonical: '/help' },
  openGraph: {
    title: 'Help & guides · PickupVB',
    description:
      'How-to guides for hosts: host your first event, get paid, run tournaments and leagues, and run a smooth event day.',
    url: '/help',
    type: 'website',
  },
};

/** Section headers, in display order. A section renders only when it has guides. */
const SECTIONS: ReadonlyArray<{ audience: HelpAudience; title: string; blurb: string }> = [
  {
    audience: 'host',
    title: 'For hosts',
    blurb: 'Everything from creating your first event to running a season.',
  },
  {
    audience: 'player',
    title: 'For players',
    blurb: 'Find a game, RSVP, and make the most of your account.',
  },
];

export default function HelpHubPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 py-2">
      <header className="space-y-2">
        <h1 className="text-fg text-headline-lg font-bold">Help &amp; guides</h1>
        <p className="text-muted max-w-2xl">
          Short, practical walkthroughs for getting the most out of PickupVB. New to hosting? Start
          with{' '}
          <Link href={'/help/getting-started' as Route} className="text-primary hover:underline">
            Host your first event
          </Link>
          .
        </p>
      </header>

      {SECTIONS.map(({ audience, title, blurb }) => {
        const guides = helpGuidesFor(audience);
        if (guides.length === 0) return null;
        return (
          <section key={audience} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-fg text-headline-sm font-semibold">{title}</h2>
              <p className="text-muted text-sm">{blurb}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {guides.map((guide) => (
                <GuideCard key={guide.slug} guide={guide} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function GuideCard({ guide }: { guide: HelpGuideMeta }) {
  return (
    <li>
      <Link
        href={`/help/${guide.slug}` as Route}
        className="border-border-base bg-md-surface-container hover:border-primary/40 rounded-shape-sm flex h-full flex-col gap-1 border p-5 transition-colors"
      >
        <span className="text-fg text-title-lg font-semibold">{guide.title}</span>
        <span className="text-muted text-sm">{guide.description}</span>
      </Link>
    </li>
  );
}
