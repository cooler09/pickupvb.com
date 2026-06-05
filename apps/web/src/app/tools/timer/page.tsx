import type { Metadata } from 'next';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { TimerSetupForm } from './_components/setup-form.js';

/**
 * SEO-facing landing page for the free match timer. The setup form is a small
 * client island (`_components/setup-form.tsx`) so the page stays a server
 * component and exports real metadata + JSON-LD. Ephemeral timer rooms under
 * `/tools/timer/[code]` stay `noindex` (robots.ts) — only this entry page is
 * advertised, like the scoreboard.
 */
export const metadata: Metadata = {
  title: 'Free match timer — shared countdown for pool play',
  description:
    'Free, no-signup countdown timer for timed games. Set a duration and share a link — every device shows the same synced clock. Great for pool play, drills, and warmups. Works for any sport. Nothing is saved.',
  alternates: { canonical: '/tools/timer' },
  keywords: [
    'match timer',
    'game timer',
    'shared countdown timer',
    'pool play timer',
    'gym timer',
    'synced timer',
    'volleyball timer',
  ],
  openGraph: {
    title: 'Free match timer — shared countdown',
    description:
      'Set a duration and share a link — every device shows the same synced countdown. No account, no install.',
    url: '/tools/timer',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free match timer',
    description: 'A shared countdown synced to every device. No signup.',
  },
};

const faqs = [
  {
    q: 'Do I need an account?',
    a: 'No. The timer is a free utility — no signup, no install, no payment.',
  },
  {
    q: 'How do other devices see the same clock?',
    a: 'Each timer gets a short room code. Share the link and any device that opens it shows the same countdown in real time — start, pause, and time adjustments sync to everyone.',
  },
  {
    q: 'Does the clock drift between devices?',
    a: 'No. Only start/pause/reset/adjustments are sent — each device counts down locally from the shared end time, so every screen stays in lockstep without per-second network chatter.',
  },
  {
    q: 'Is anything saved?',
    a: 'No. The timer lives only on the connected devices and a Supabase Realtime channel with nothing at rest. It auto-clears after 24h of inactivity.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'PickupVB Match Timer',
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Any (browser)',
      url: 'https://pickupvb.com/tools/timer',
      description:
        'Free, no-signup shared countdown timer. Set a duration and share a link — every device shows the same synced clock.',
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

export default function TimerSetupPage() {
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
          { name: 'Match timer', path: '/tools/timer' },
        ]}
      />

      <header className="space-y-1">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Host tool · Free
        </p>
        <h1 className="text-3xl font-bold">Match timer</h1>
        <p className="text-muted text-sm">
          A full-screen countdown you can share to every court. Set a duration, hit start, and every
          device on the link stays in sync. Nothing is saved on our servers.
        </p>
      </header>

      <TimerSetupForm />

      <div className="text-muted border-border-base rounded-md border border-dashed p-4 text-xs">
        <p className="text-fg font-medium">How it works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Pick a duration (or a quick preset) and start the timer.</li>
          <li>Share the room link — every device shows the same countdown.</li>
          <li>Start, pause, and ±1:00 adjustments sync to all screens in real time.</li>
          <li>State auto-clears after 24h of inactivity.</li>
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
