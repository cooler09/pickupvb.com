import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Skip-budget guard (e2e audit finding C1).
 *
 * The suite's biggest reliability risk isn't a flaky test — it's a *green* run
 * that executed nothing. `test.fixme` bodies always skip, and precondition
 * `test.skip`s fire when ambient data is missing, so absent coverage reports as
 * success. This reporter counts skipped tests and, when a budget is configured,
 * fails the run if the count exceeds it — so a regression (or a quietly
 * re-`fixme`'d test) can't silently inflate the skip total.
 *
 * Budget source — the `E2E_SKIP_BUDGET` env var:
 *   - unset → **warn-only**: print the skip count + the offenders, never fail.
 *     This keeps the suite green while Phases 1–5 still carry sanctioned
 *     `test.fixme` placeholders, so wiring the reporter in today is a no-op for
 *     existing runs.
 *   - set   → **enforce**: if `skipped > E2E_SKIP_BUDGET`, fail the whole run.
 *
 * CI opts in by exporting `E2E_SKIP_BUDGET=<N>` once a baseline is agreed
 * (audit open decision #1). Set N to the count of *sanctioned* infra-gated
 * skips (Stripe run, email inbox, deploy flag) so converting a `fixme` into a
 * real test can only lower the count — a ratchet, never a license to skip more.
 */
class SkipBudgetReporter implements Reporter {
  /** Keyed by test id so retries / duplicate `onTestEnd` calls don't double-count. */
  private readonly skipped = new Map<string, string>();

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'skipped') {
      this.skipped.set(test.id, test.titlePath().filter(Boolean).join(' › '));
    }
  }

  async onEnd(): Promise<{ status: FullResult['status'] } | undefined> {
    const count = this.skipped.size;

    if (count === 0) {
      console.log('\n[skip-budget] 0 skipped tests.');
      return undefined;
    }

    const offenders = [...this.skipped.values()].map((title) => `  - ${title}`).join('\n');
    const raw = process.env.E2E_SKIP_BUDGET;
    const budget = raw === undefined || raw.trim() === '' ? null : Number(raw);

    if (budget === null || Number.isNaN(budget)) {
      console.log(
        `\n[skip-budget] ${count} skipped test(s) — warn-only ` +
          `(set E2E_SKIP_BUDGET=<N> to enforce):\n${offenders}`,
      );
      return undefined;
    }

    if (count > budget) {
      console.error(
        `\n[skip-budget] FAIL: ${count} skipped test(s) exceeds budget ${budget}:\n${offenders}\n` +
          `Convert a fixme/skip to a real test, or raise E2E_SKIP_BUDGET only with justification.`,
      );
      return { status: 'failed' };
    }

    console.log(`\n[skip-budget] OK: ${count} skipped test(s) within budget ${budget}.`);
    return undefined;
  }
}

export default SkipBudgetReporter;
