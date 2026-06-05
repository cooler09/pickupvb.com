/**
 * The onboarding-progress rule, in one place.
 *
 * Pure and total: given a step catalog and a track snapshot it returns each
 * step's done/not-done plus the required-vs-optional rollup the UI keys its
 * visibility off. This is the *whole* "what's done, and should the card still
 * show?" decision, and `onboarding-progress.test.ts` is its executable spec.
 */
import type { OnboardingStep } from './onboarding-catalog.js';

/** A step with its computed completion flag (carries the catalog display through). */
export interface OnboardingStepStatus {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly optional: boolean;
  readonly done: boolean;
}

/** The rollup the checklist card renders + decides visibility from. */
export interface ChecklistProgress {
  readonly steps: readonly OnboardingStepStatus[];
  /** Count of required (non-optional) steps. */
  readonly requiredTotal: number;
  /** Count of required steps the user has completed. */
  readonly requiredDone: number;
  /** Every required step is done — the card should hide (optional steps may remain). */
  readonly requiredComplete: boolean;
  /** Every step, required and optional, is done. */
  readonly allComplete: boolean;
}

/** Evaluate a track's steps against its snapshot. */
export function progressFor<S>(
  steps: readonly OnboardingStep<S>[],
  snapshot: S,
): ChecklistProgress {
  const evaluated: OnboardingStepStatus[] = steps.map((step) => ({
    key: step.key,
    title: step.title,
    description: step.description,
    href: step.href,
    optional: step.optional ?? false,
    done: step.isComplete(snapshot),
  }));
  const required = evaluated.filter((s) => !s.optional);
  const requiredDone = required.filter((s) => s.done).length;
  return {
    steps: evaluated,
    requiredTotal: required.length,
    requiredDone,
    requiredComplete: requiredDone === required.length,
    allComplete: evaluated.every((s) => s.done),
  };
}
