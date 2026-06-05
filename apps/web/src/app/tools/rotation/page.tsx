import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { JsonLd } from '@/components/json-ld';
import { RotationSetupForm } from './_components/setup-form.js';

/**
 * SEO-facing landing page for the free court-rotation queue. The setup form is
 * a small client island (`_components/setup-form.tsx`) so the page stays a
 * server component and exports real metadata + JSON-LD. Ephemeral rotation
 * rooms under `/tools/rotation/[code]` stay `noindex` (robots.ts) — only this
 * entry page is advertised, like the scoreboard and timer.
 */
export const metadata: Metadata = {
  title: 'Free court rotation queue — king of the court for open gym',
  description:
    'Free, no-signup rotation queue for open-gym pickup. Track who’s on each court and who’s next; winners stay, losers rotate out. Share a link so everyone sees the same queue. Nothing is saved.',
  alternates: { canonical: '/tools/rotation' },
  keywords: [
    'court rotation',
    'king of the court',
    'open gym rotation',
    'winners stay queue',
    'next up queue',
    'pickup rotation tracker',
    'volleyball court rotation',
  ],
  openGraph: {
    title: 'Free court rotation queue — king of the court',
    description:
      'Track who’s on each court and who’s next; winners stay, losers rotate out. Shared across devices. No account, no install.',
    url: '/tools/rotation',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free court rotation queue',
    description: 'King-of-the-court next-up queue for open gym. No signup.',
  },
};

const faqs = [
  {
    q: 'Do I need an account?',
    a: 'No. The rotation queue is a free utility — no signup, no install, no payment.',
  },
  {
    q: 'How does the rotation work?',
    a: 'Add your teams or players — they fill the open courts and the rest line up. When a game ends, tap the winner: they stay on, the loser goes to the back of the queue, and the next team up takes the court.',
  },
  {
    q: 'Can everyone see the same queue?',
    a: 'Yes. Each room gets a short code — share the link and every device shows the same courts and queue in real time, so anyone can report a result.',
  },
  {
    q: 'Is anything saved?',
    a: 'No. The board lives only on the connected devices and a Supabase Realtime channel with nothing at rest. It auto-clears after 24h of inactivity.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'PickupVB Court Rotation Queue',
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Any (browser)',
      url: 'https://pickupvb.com/tools/rotation',
      description:
        'Free, no-signup king-of-the-court rotation queue. Track who is on each court and who is next; winners stay, losers rotate out.',
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

export default function RotationSetupPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <JsonLd data={jsonLd} />
      <BreadcrumbJsonLd
        trail={[
          { name: 'Host tools', path: '/tools' },
          { name: 'Court rotation queue', path: '/tools/rotation' },
        ]}
      />

      <header className="space-y-1">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Host tool · Free
        </p>
        <h1 className="text-3xl font-bold">Court rotation queue</h1>
        <p className="text-muted text-sm">
          King-of-the-court for busy open gyms. Add your teams, and the tool tracks who&rsquo;s on
          each court and who&rsquo;s next — winners stay, losers rotate out. Share a link so
          everyone sees the same queue. Nothing is saved.
        </p>
      </header>

      <RotationSetupForm />

      <div className="text-muted border-border-base rounded-md border border-dashed p-4 text-xs">
        <p className="text-fg font-medium">How it works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Pick how many courts you have and start a room.</li>
          <li>Add teams or players — they fill the courts and the rest queue up.</li>
          <li>Tap the winner of each game: they stay on, the loser goes to the back.</li>
          <li>Share the link so anyone can report results from their phone.</li>
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
