import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { JsonLd } from '@/components/json-ld';
import { ScoreboardSetupForm } from './_components/setup-form.js';
import { ScoreboardJoinForm } from './_components/join-form.js';

/**
 * SEO-facing landing page for the free live score tracker. The setup
 * form is a small client island (`_components/setup-form.tsx`) so the
 * page itself can stay a server component and export real metadata that
 * crawlers and link-previewers can index. Ephemeral game rooms under
 * `/tools/scoreboard/[code]` stay `noindex` — only this entry page and
 * the `/tools` index are advertised to search engines (sitemap.ts).
 */
export const metadata: Metadata = {
  title: 'Free live volleyball score tracker (works for any sport)',
  description:
    'Free, no-signup live scoreboard for volleyball, pickleball, basketball, and any sport. Full-screen score display with a shareable phone remote. Real-time sync across devices. No account required.',
  alternates: { canonical: '/tools/scoreboard' },
  keywords: [
    'volleyball scoreboard',
    'live score tracker',
    'pickleball scoreboard',
    'free scoreboard app',
    'phone scoreboard',
    'tournament scorekeeper',
    'shared scoreboard',
  ],
  openGraph: {
    title: 'Free live score tracker — volleyball, pickleball, any sport',
    description:
      'Full-screen scoreboard with a shareable phone remote. Real-time sync, no account, no install.',
    url: '/tools/scoreboard',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free live score tracker',
    description: 'Full-screen scoreboard with a shareable phone remote. No signup.',
  },
};

const faqs = [
  {
    q: 'Do I need an account?',
    a: 'No. The scoreboard is a free utility — no signup, no install, no payment.',
  },
  {
    q: 'What sports does it work for?',
    a: 'Any rally-scored sport. You set the target score (25 for volleyball, 11 for pickleball, 21 for badminton, etc.), the win-by margin, and how many sets the match goes to.',
  },
  {
    q: 'How do players join from a phone?',
    a: 'Each game gets a short room code shown on the scoreboard. Players can scan the QR in the Share panel, open the shared link (e.g. pickupvb.com/s/ABCD), or come to this page and type the code under “Keep score from your phone.” Any phone that joins can tap to score — every device stays in sync in real time.',
  },
  {
    q: 'Is the score saved anywhere?',
    a: 'No. State lives only on the connected devices and on a Supabase Realtime broadcast channel that has nothing at rest. Auto-clears after 24h of inactivity.',
  },
  {
    q: 'How many people can join one game?',
    a: 'There is no hard limit — the scoreboard and any number of remote devices share the same room.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'PickupVB Live Score Tracker',
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Any (browser)',
      url: 'https://pickupvb.com/tools/scoreboard',
      description:
        'Free, no-signup live scoreboard for any rally-scored sport. Full-screen score display with a real-time phone remote.',
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

export default function ScoreboardSetupPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <JsonLd data={jsonLd} />
      <BreadcrumbJsonLd
        trail={[
          { name: 'Host tools', path: '/tools' },
          { name: 'Live score tracker', path: '/tools/scoreboard' },
        ]}
      />

      <header className="space-y-1">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Host tool · Free
        </p>
        <h1 className="text-headline-lg font-bold">Live score tracker</h1>
        <p className="text-muted text-sm">
          Spin up a full-screen scoreboard with a shareable remote link. Works for any sport — set
          the target score, the win-by margin, and how many sets. Nothing is saved on our servers;
          the game lives on your device and the realtime channel.
        </p>
      </header>

      <ScoreboardSetupForm />

      <ScoreboardJoinForm />

      <div className="text-muted border-border-base rounded-md border border-dashed p-4 text-xs">
        <p className="text-fg font-medium">How it works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your device shows a full-screen scoreboard.</li>
          <li>Share the room URL with anyone — they get a phone-sized remote.</li>
          <li>Taps on either device update both in real time.</li>
          <li>State auto-clears after 24h of inactivity.</li>
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
