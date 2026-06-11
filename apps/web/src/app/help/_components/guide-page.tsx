import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
import { helpGuide, type HelpGuideMeta, type HelpSlug } from '../help-meta';

/**
 * Shared chassis for every `/help/<slug>` guide. The authored body is wrapped in
 * a prose `<article>` (the M3 type-scale heading rules, mirroring
 * [legal/layout.tsx](../../legal/layout.tsx)); the breadcrumb + footer chrome sit
 * *outside* it so the `[&_a]:underline` prose rule (which beats a `no-underline`
 * utility on specificity) doesn't force-underline the nav links. Scoping the
 * chassis here (not a `help/layout.tsx`) also keeps the card-grid hub at `/help`
 * out of prose styling. Pure server component — content + links, no client JS.
 */
const PROSE = [
  '[&_h2]:text-headline-sm [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:font-semibold',
  '[&_h3]:text-title-lg [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold',
  '[&_p]:my-3 [&_p]:leading-relaxed',
  '[&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6',
  '[&_a]:text-primary [&_a]:underline hover:[&_a]:opacity-80',
  '[&_strong]:font-semibold',
].join(' ');

/** Footer call-to-action, keyed off the guide's audience. */
const CTA: Record<HelpGuideMeta['audience'], { href: Route; label: string }> = {
  host: { href: '/events/new' as Route, label: 'Host an event →' },
  player: { href: '/events' as Route, label: 'Browse events →' },
};

export function GuidePage({ slug, children }: { slug: HelpSlug; children: ReactNode }) {
  const guide = helpGuide(slug);
  const cta = CTA[guide.audience];
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-4 text-sm">
        <Link href={'/help' as Route} className="text-muted hover:text-fg">
          ← All guides
        </Link>
      </p>

      <h1 className="text-fg text-headline-lg font-bold">{guide.title}</h1>
      <p className="text-muted mt-1 text-sm">
        <em>Last updated: {guide.lastUpdated}</em>
      </p>

      <article className={PROSE}>{children}</article>

      <hr className="border-border-base my-8" />
      <div className="flex flex-wrap items-center gap-4">
        <Link href={cta.href} className={primaryButtonClass('md')}>
          {cta.label}
        </Link>
        <Link href={'/help' as Route} className="text-primary text-sm hover:underline">
          Browse all guides
        </Link>
      </div>
    </div>
  );
}
