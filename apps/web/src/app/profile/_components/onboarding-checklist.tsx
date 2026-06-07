import Link from 'next/link';
import type { Route } from 'next';
import type { ChecklistProgress, OnboardingStepStatus } from '@pickupvb/domain';

/**
 * Onboarding checklist card (ADR 0035, Phase 1). A server component — it's links
 * + completion marks, no interactivity. Renders a tinted callout (same vocabulary
 * as the pending-invites / PR-3 "Get started" card it supersedes) with a
 * required-step progress line and one row per step: completed rows show a check
 * and de-emphasise; open rows are tappable links.
 *
 * Visibility is the caller's job — pass a `progress` whose required steps aren't
 * all done (the page hides the card once `progress.requiredComplete`), so the
 * card never nags a user who's finished setting up.
 */
export function OnboardingChecklist({
  heading,
  intro,
  progress,
}: {
  heading: string;
  intro: string;
  progress: ChecklistProgress;
}) {
  return (
    <section className="border-primary/30 bg-primary/5 rounded-shape-sm border p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">{heading}</h2>
        <span className="text-muted shrink-0 text-xs font-medium">
          {progress.requiredDone} of {progress.requiredTotal} done
        </span>
      </div>
      <p className="text-muted mt-1 text-sm">{intro}</p>
      <ol className="mt-4 space-y-2">
        {progress.steps.map((step) => (
          <ChecklistRow key={step.key} step={step} />
        ))}
      </ol>
    </section>
  );
}

function ChecklistRow({ step }: { step: OnboardingStepStatus }) {
  if (step.done) {
    return (
      <li className="border-border-base bg-md-surface-container/60 flex items-center gap-3 rounded-md border p-3">
        <CheckMark />
        <span className="min-w-0 flex-1">
          <span className="text-muted block text-sm font-medium line-through">{step.title}</span>
        </span>
        {step.optional && <OptionalTag />}
      </li>
    );
  }
  return (
    <li>
      <Link
        href={step.href as Route}
        className="border-border-base bg-md-surface-container hover:border-primary/40 flex items-center gap-3 rounded-md border p-3"
      >
        <PendingCircle />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{step.title}</span>
          <span className="text-muted block text-xs">{step.description}</span>
        </span>
        {step.optional && <OptionalTag />}
        <span className="text-primary shrink-0 text-sm" aria-hidden>
          →
        </span>
      </Link>
    </li>
  );
}

function CheckMark() {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path
          d="M5 10.5l3 3 7-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function PendingCircle() {
  return (
    <span
      aria-hidden
      className="border-primary/40 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
    />
  );
}

function OptionalTag() {
  return (
    <span className="bg-fg/5 text-muted shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase">
      Optional
    </span>
  );
}
