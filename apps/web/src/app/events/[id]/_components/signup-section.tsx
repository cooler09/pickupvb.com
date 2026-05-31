import type { ReactNode } from 'react';

type Tone = 'free' | 'paid' | 'external' | 'closed' | 'neutral';

type Props = {
  title: string;
  /** Short context badge shown next to the title (e.g. price, "Position-based", "Tournament"). */
  badge?: { tone?: Tone; label: string } | undefined;
  /** Optional sub-line under the title (e.g. spots remaining, registration deadline). */
  subline?: ReactNode;
  children: ReactNode;
};

const BADGE_TONE: Record<Tone, string> = {
  free: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
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
export function SignupSection({ title, badge, subline, children }: Props) {
  const tone = badge?.tone ?? 'neutral';
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
        {badge && (
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${BADGE_TONE[tone]}`}
          >
            {badge.label}
          </span>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}
