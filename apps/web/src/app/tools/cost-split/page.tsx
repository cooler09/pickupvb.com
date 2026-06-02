import type { Metadata } from 'next';
import { CostSplit } from './_components/cost-split.js';

/**
 * SEO-facing landing page for the free cost-split calculator. The calculator is
 * a small client island (`_components/cost-split.tsx`) so the page stays a
 * server component and exports real metadata + JSON-LD. Backend-free — the
 * amounts never leave the browser — matching the other host tools.
 */
export const metadata: Metadata = {
  title: 'Free cost split calculator — split court & gym fees',
  description:
    'Free, no-signup cost splitter for pickup sports. Enter the total and your attendees to split a court or gym rental evenly — or by shares — to the exact cent. Nothing is saved.',
  alternates: { canonical: '/tools/cost-split' },
  keywords: [
    'cost split calculator',
    'split the bill',
    'court rental split',
    'gym fee split',
    'split cost evenly',
    'who owes what',
  ],
  openGraph: {
    title: 'Free cost split calculator',
    description:
      'Split a court or gym rental evenly or by shares, to the exact cent. No account, no install.',
    url: '/tools/cost-split',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free cost split calculator',
    description: 'Split court & gym fees evenly or by shares. No signup.',
  },
};

const faqs = [
  {
    q: 'Do I need an account?',
    a: 'No. The cost splitter is a free utility — no signup, no install, no payment.',
  },
  {
    q: 'How are uneven cents handled?',
    a: 'The split works in whole cents and the leftover cents go to whoever is rounded down the most, so everyone’s share always adds back up to the exact total.',
  },
  {
    q: 'Can someone pay more than one share?',
    a: 'Yes. Add a number after a name — "Alex 2" means Alex covers two shares — to split unevenly. Leave it off for an even split.',
  },
  {
    q: 'Are my amounts saved anywhere?',
    a: 'No. Everything stays in your browser. Nothing is sent to our servers or saved.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'PickupVB Cost Split Calculator',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any (browser)',
      url: 'https://pickupvb.com/tools/cost-split',
      description:
        'Free, no-signup cost splitter. Split a court or gym rental evenly or by shares, to the exact cent.',
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

export default function CostSplitPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <script
        type="application/ld+json"
        // Static, server-rendered JSON — safe to inline.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="space-y-1">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Host tool · Free
        </p>
        <h1 className="text-3xl font-bold">Cost split calculator</h1>
        <p className="text-muted text-sm">
          Split a court or gym rental across everyone who showed up — evenly, or by shares — to the
          exact cent. Updates live as you type. Nothing is saved.
        </p>
      </header>

      <CostSplit />

      <div className="text-muted border-border-base rounded-md border border-dashed p-4 text-xs">
        <p className="text-fg font-medium">How it works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Enter the total cost.</li>
          <li>Paste your attendees, one name per line.</li>
          <li>Add a number after a name to give them extra shares (e.g. &ldquo;Alex 2&rdquo;).</li>
          <li>Everyone’s share adds back to the exact total — copy it to share.</li>
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
