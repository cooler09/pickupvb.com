import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free host tools for volleyball (and any sport)',
  description:
    'Free, no-signup utilities for running pickup games and tournaments: a live score tracker with a phone remote, brackets, seeding, and standings. Works on any device.',
  alternates: { canonical: '/tools' },
  openGraph: {
    title: 'Free host tools for volleyball',
    description: 'Live score tracker, brackets, seeding, and standings. No account, no install.',
    url: '/tools',
    type: 'website',
  },
};

type Tool = {
  slug: string;
  title: string;
  desc: string;
  href?: Route;
  status: 'live' | 'soon';
};

export default function ToolsPage() {
  const tools: Tool[] = [
    {
      slug: 'scoreboard',
      title: 'Live score tracker',
      desc: 'Full-screen scoreboard with a shareable phone remote. Works for any sport.',
      href: '/tools/scoreboard' as Route,
      status: 'live',
    },
    {
      slug: 'bracket',
      title: 'Tournament bracket creator',
      desc: 'Single & double elimination.',
      status: 'soon',
    },
    {
      slug: 'seeding',
      title: 'Seeding generator',
      desc: 'Snake / random / ranked.',
      status: 'soon',
    },
    {
      slug: 'standings',
      title: 'Win/loss tracker',
      desc: 'Round-robin standings.',
      status: 'soon',
    },
  ];
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Host tools</h1>
      <p className="text-muted">
        Generic, host-controlled utilities for running your event smoothly. Free to use — no account
        required.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {tools.map((t) => {
          const inner = (
            <>
              <h2 className="font-semibold">{t.title}</h2>
              <p className="text-muted text-sm">{t.desc}</p>
              <p
                className={`mt-2 text-xs tracking-wide uppercase ${
                  t.status === 'live' ? 'text-emerald-600' : 'text-primary'
                }`}
              >
                {t.status === 'live' ? 'Open →' : 'Coming soon'}
              </p>
            </>
          );
          return (
            <li key={t.slug}>
              {t.href ? (
                <Link
                  href={t.href}
                  className="border-border-base hover:border-primary hover:bg-primary/5 block rounded-lg border p-4 transition-colors"
                >
                  {inner}
                </Link>
              ) : (
                <div className="border-border-base rounded-lg border p-4 opacity-80">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
