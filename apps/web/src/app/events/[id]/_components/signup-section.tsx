import type { ReactNode } from 'react';

type Tone = 'free' | 'paid' | 'external' | 'closed' | 'neutral';

type Props = {
  title: string;
  /** Short context badge shown next to the title (e.g. price, "Position-based", "Tournament"). */
  badge?: { tone?: Tone; label: string } | undefined;
  /** Optional sub-line under the title (e.g. spots remaining, registration deadline). */
  subline?: ReactNode;
  /**
   * When true the card becomes a native `<details>` disclosure so viewers can
   * collapse it. Defaults to a plain always-open `<section>` to keep the
   * primary conversion CTA in front of prospective registrants.
   */
  collapsible?: boolean;
  /**
   * Initial open state for the collapsible variant. The "smart" default the
   * caller computes: open for visitors who haven't registered yet, collapsed
   * once the viewer is already attending / has a team. Ignored when
   * `collapsible` is false. Defaults to open.
   */
  defaultOpen?: boolean;
  children: ReactNode;
};

const BADGE_TONE: Record<Tone, string> = {
  free: 'bg-md-success/10 text-md-success border-md-success/30',
  paid: 'bg-primary/10 text-primary border-primary/30',
  external: 'bg-secondary/10 text-secondary border-secondary/30',
  closed: 'bg-fg/5 text-muted border-border-base',
  neutral: 'bg-fg/5 text-fg border-border-base',
};

/**
 * Shared visual frame for every RSVP / signup variant on the event detail
 * page. Keeps free / paid / position / tournament / closed states under one
 * clearly-labelled "Sign up" card so users always know where to look.
 */
export function SignupSection({
  title,
  badge,
  subline,
  collapsible = false,
  defaultOpen = true,
  children,
}: Props) {
  const tone = badge?.tone ?? 'neutral';
  const badgeEl = badge && (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${BADGE_TONE[tone]}`}
    >
      {badge.label}
    </span>
  );

  if (collapsible) {
    return (
      // `open` is set via conditional spread (not `open={false}`) so React
      // never controls the attribute — native toggling stays free. Matches the
      // disclosure idiom in event-filter-form / profile.
      <details
        id="signup"
        className="group border-border-base bg-surface rounded-shape-sm scroll-mt-20 border"
        {...(defaultOpen ? { open: true } : {})}
      >
        <summary className="hover:bg-fg/5 flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-5 select-none sm:p-6 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 space-y-1">
            <h2 className="text-fg text-lg font-semibold">{title}</h2>
            {subline && <p className="text-muted text-sm">{subline}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {badgeEl}
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="text-muted h-4 w-4 transition-transform group-open:rotate-180"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </summary>
        <div className="border-border-base border-t p-5 sm:p-6">{children}</div>
      </details>
    );
  }

  return (
    <section
      id="signup"
      className="border-border-base bg-surface rounded-shape-sm scroll-mt-20 space-y-4 border p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-fg text-lg font-semibold">{title}</h2>
          {subline && <p className="text-muted text-sm">{subline}</p>}
        </div>
        {badgeEl}
      </header>
      <div>{children}</div>
    </section>
  );
}
