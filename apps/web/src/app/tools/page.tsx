import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { primaryButtonClass } from '@/components/primary-button';

export const metadata: Metadata = {
  title: 'Free host tools for volleyball (and any sport)',
  description:
    'Free, no-signup utilities for running pickup games and tournaments: a live score tracker with a phone remote and a tournament bracket creator. Team randomizer, scheduling, seeding, and standings tools are on the way. Works on any device.',
  alternates: { canonical: '/tools' },
  openGraph: {
    title: 'Free host tools for volleyball',
    description:
      'Live score tracker with a phone remote and a tournament bracket creator. No account, no install.',
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
  /** Small qualifier badge, e.g. the bracket creator needs an account. */
  note?: string;
};

const TOOLS: Tool[] = [
  {
    slug: 'scoreboard',
    title: 'Live score tracker',
    desc: 'Full-screen scoreboard with a shareable phone remote. Real-time sync across devices, any sport.',
    href: '/tools/scoreboard' as Route,
    status: 'live',
  },
  {
    slug: 'bracket',
    title: 'Tournament bracket creator',
    desc: 'Single & double elimination, round robin, and pool play. Track results live and share a spectator link.',
    href: '/brackets' as Route,
    status: 'live',
    note: 'Sign-in',
  },
  {
    slug: 'team-randomizer',
    title: 'Team randomizer',
    desc: 'Paste a roster and split it into balanced or random teams in one tap.',
    href: '/tools/team-randomizer' as Route,
    status: 'live',
  },
  {
    slug: 'scheduler',
    title: 'Round-robin scheduler',
    desc: 'Enter your teams and courts; get a full matchup schedule for every round.',
    href: '/tools/scheduler' as Route,
    status: 'live',
  },
  {
    slug: 'seeding',
    title: 'Seeding generator',
    desc: 'Snake, random, or ranked seeding for any bracket or pool.',
    href: '/tools/seeding' as Route,
    status: 'live',
  },
  {
    slug: 'standings',
    title: 'Win/loss standings',
    desc: 'Round-robin standings with automatic tiebreakers.',
    href: '/tools/standings' as Route,
    status: 'live',
  },
  {
    slug: 'rotation',
    title: 'Court rotation queue',
    desc: 'King-of-the-court style next-up queue for busy open gyms.',
    href: '/tools/rotation' as Route,
    status: 'live',
  },
  {
    slug: 'timer',
    title: 'Match timer',
    desc: 'Full-screen countdown for timed pool play, shared to every court.',
    href: '/tools/timer' as Route,
    status: 'live',
  },
];

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="bg-fg/5 text-muted shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase">
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">{children}</h2>;
}

export default function ToolsPage() {
  const live = TOOLS.filter((t) => t.status === 'live');
  const soon = TOOLS.filter((t) => t.status === 'soon');

  return (
    <section className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-2">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Free · No account
        </p>
        <h1 className="text-3xl font-bold">Host tools</h1>
        <p className="text-muted">
          Generic, host-controlled utilities for running your event smoothly — built for volleyball,
          handy for any sport. No signup, no install.
        </p>
      </header>

      <div className="space-y-3">
        <SectionLabel>Available now</SectionLabel>
        <ul className="grid gap-4 sm:grid-cols-2">
          {live.map((t) => (
            <li key={t.slug}>
              <Link
                href={t.href!}
                className="group border-border-base hover:border-primary hover:bg-primary/5 rounded-shape-sm flex h-full flex-col border p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-fg font-semibold">{t.title}</h3>
                  {t.note ? <Badge>{t.note}</Badge> : null}
                </div>
                <p className="text-muted mt-1 text-sm">{t.desc}</p>
                <p className="text-primary mt-3 text-sm font-medium">Open →</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {soon.length > 0 ? (
        <div className="space-y-3">
          <SectionLabel>On the roadmap</SectionLabel>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {soon.map((t) => (
              <li key={t.slug}>
                <div className="border-border-base rounded-shape-sm flex h-full flex-col border border-dashed p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-fg font-semibold">{t.title}</h3>
                    <Badge>Soon</Badge>
                  </div>
                  <p className="text-muted mt-1 text-sm">{t.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-border-base bg-fg/5 rounded-shape-sm flex flex-col gap-3 border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <p className="text-fg font-semibold">Running a real event?</p>
          <p className="text-muted text-sm">
            Create a listing, take RSVPs and payments, and manage your roster.
          </p>
        </div>
        <Link href={'/events/new' as Route} className={`${primaryButtonClass('md')} shrink-0`}>
          Host an event
        </Link>
      </div>
    </section>
  );
}
