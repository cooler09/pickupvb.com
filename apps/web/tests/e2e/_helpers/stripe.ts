import { expect, type Page } from '@playwright/test';

/**
 * Stripe test-mode harness for paid-flow e2e tests.
 *
 * Strategy
 * --------
 * - Tests run against the dev environment which MUST have a permanent
 *   Stripe webhook endpoint configured in the Stripe dashboard pointing
 *   at `https://dev.pickupvb.com/api/webhooks/stripe`. We do NOT spawn
 *   `stripe listen` from tests — that would add subprocess-lifecycle
 *   complexity and ordering hazards. Instead, after Checkout completes
 *   on `checkout.stripe.com`, Stripe POSTs the webhook back to dev, which
 *   mutates the DB, and the test polls the UI for the resulting state.
 *
 * - Stripe-hosted Checkout selectors are documented by Stripe themselves
 *   as brittle. We use the official `aria-label` selectors where possible
 *   and fall back to `name=` for inputs that Stripe renders without a
 *   stable label. If a selector drifts, fix it here — it's referenced by
 *   every paid-flow test.
 *
 * - `TEST_STRIPE_HOST_EMAIL` is assumed to be onboarded
 *   (charges_enabled = true) on dev. Tests that need a paid event create
 *   the event under that storage state via `createPaidEvent` in
 *   `event-create.ts`.
 *
 * See `apps/web/tests/e2e/README.md` §"Stripe Checkout / Connect /
 * webhook-driven tests" for the runbook.
 */

/**
 * Stripe test cards. Full list: https://stripe.com/docs/testing
 *
 * The success card succeeds without 3DS. The decline card surfaces as
 * `payment_intent.payment_failed` and Stripe re-renders the form with an
 * inline error. The 3DS card requires the test to handle the challenge
 * frame — we don't graduate any test that needs 3DS.
 */
export const STRIPE_TEST_CARDS = {
  success: '4242 4242 4242 4242',
  declined: '4000 0000 0000 0002',
  insufficientFunds: '4000 0000 0000 9995',
  threeDsRequired: '4000 0025 0000 3155',
} as const;

export interface StripeCheckoutFormInput {
  /** Card number with or without spaces. */
  card: string;
  /** "MM / YY" or "MMYY"; any valid future date works. */
  expiry?: string;
  cvc?: string;
  /** Cardholder name. Stripe requires this in many configs. */
  name?: string;
  /** ZIP / postal code. Stripe asks for this when the account is US-billing. */
  postalCode?: string;
}

/**
 * Fill the Stripe-hosted Checkout payment form. Call on the page that has
 * already navigated to `checkout.stripe.com/...` (i.e. after the server
 * action's `redirect(session.url)` fires).
 *
 * Returns when the form is filled and the Pay button has been clicked.
 * Does NOT wait for the redirect back to the app — use
 * `waitForStripeRedirect` for that.
 *
 * Stripe's hosted page is iframe-free for the main payment fields (they
 * were split out years ago) but the form is hydrated client-side, so we
 * give the page generous time to settle before typing.
 */
export async function fillStripeCheckout(
  page: Page,
  input: StripeCheckoutFormInput,
): Promise<void> {
  // Wait for the actual Stripe page to settle. The hosted checkout has a
  // skeleton that flashes before fields are interactive.
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded');

  const cardNumber = page.locator('input#cardNumber, input[name="cardNumber"]').first();
  await expect(cardNumber, 'Stripe Checkout card number field').toBeVisible({ timeout: 30_000 });
  await cardNumber.fill(input.card);

  const expiry = page.locator('input#cardExpiry, input[name="cardExpiry"]').first();
  await expiry.fill(input.expiry ?? '12 / 34');

  const cvc = page.locator('input#cardCvc, input[name="cardCvc"]').first();
  await cvc.fill(input.cvc ?? '123');

  // Name field is conditionally rendered.
  const name = page.locator('input#billingName, input[name="billingName"]').first();
  if (await name.isVisible().catch(() => false)) {
    await name.fill(input.name ?? 'E2E Test Buyer');
  }

  // ZIP is conditionally rendered (US-billing accounts).
  const postal = page.locator('input#billingPostalCode, input[name="billingPostalCode"]').first();
  if (await postal.isVisible().catch(() => false)) {
    await postal.fill(input.postalCode ?? '23451');
  }

  // Stripe Link "Save my information for faster checkout" is auto-checked
  // and requires a phone number. Uncheck it so we don't have to manage
  // Link account state in tests. The checkbox id is `enableStripePass` on
  // current Stripe Checkout; fall back to the accessible name.
  const linkOptIn = page
    .locator(
      'input#enableStripePass, input[name="enableStripePass"], input[aria-label*="Save my info" i]',
    )
    .first();
  if (await linkOptIn.isVisible().catch(() => false)) {
    if (await linkOptIn.isChecked().catch(() => false)) {
      await linkOptIn.uncheck({ force: true }).catch(async () => {
        // Some Stripe variants render a custom checkbox — click the label.
        await page
          .getByText(/save my info(rmation)? for faster checkout/i)
          .first()
          .click();
      });
    }
  }

  // The submit button label varies: "Pay $X.XX", "Subscribe", "Start trial".
  const submit = page
    .locator('button[type="submit"]')
    .filter({ hasText: /pay|subscribe|start trial|complete/i })
    .first();
  await expect(submit, 'Stripe Checkout submit button').toBeVisible({ timeout: 10_000 });
  await submit.click();
}

/**
 * Click a `ConfirmSubmitButton` trigger and then confirm in the resulting
 * `<dialog>`. The trigger AND the confirm button share the same accessible
 * name (the dialog's confirm defaults to the trigger label), so naive
 * `getByRole('button', { name })` is ambiguous after the dialog opens.
 *
 * Pass the visible label as a regex. After confirmation, the form's
 * server action runs — if that ends in `redirect(...)` (Stripe Checkout,
 * etc.) the caller should `waitForURL` against the destination.
 */
export async function clickConfirmedSubmit(
  page: Page,
  nameRegex: RegExp,
  opts: { triggerTimeoutMs?: number } = {},
): Promise<void> {
  const trigger = page.getByRole('button', { name: nameRegex }).first();
  await expect(trigger, `confirm-submit trigger ${nameRegex}`).toBeVisible({
    timeout: opts.triggerTimeoutMs ?? 10_000,
  });
  await trigger.click();
  // The dialog mounts synchronously after the click. Scope to the dialog
  // role and re-match the same label — that's the confirm button.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole('button', { name: nameRegex }).click();
}

/**
 * Wait for the Stripe Checkout flow to redirect back to the app. Use after
 * `fillStripeCheckout` on the happy path.
 *
 * @param page         The page driving Checkout.
 * @param appOrigin    Origin to match in the post-redirect URL (e.g.
 *                     `https://dev.pickupvb.com`). Test reads from
 *                     `PLAYWRIGHT_BASE_URL`.
 * @param timeoutMs    How long to wait — Stripe + webhook + redirect can
 *                     take 10s+ on a cold start.
 */
export async function waitForStripeRedirect(
  page: Page,
  appOrigin: string,
  timeoutMs = 30_000,
): Promise<void> {
  await page.waitForURL((url) => url.origin === appOrigin, { timeout: timeoutMs });
}

/**
 * Wait for a Stripe decline error to surface in the hosted form. The
 * decline path keeps the user on `checkout.stripe.com` — there's no
 * redirect to assert against, so we look for the inline error.
 */
export async function expectStripeDeclineError(page: Page, timeoutMs = 15_000): Promise<void> {
  const error = page
    .getByText(/declined|card was declined|insufficient funds|try a different card/i)
    .first();
  await expect(error).toBeVisible({ timeout: timeoutMs });
}

/**
 * Poll the UI until `check` returns true, or throw after `timeoutMs`. Used
 * to wait for webhook-driven state mutations (paid roster row appears,
 * Pro badge shows up, etc.). The harness deliberately does NOT poll the
 * DB directly — it asserts on the same UI a real user would see, which
 * also exercises the page's revalidation path.
 */
export async function pollUiFor(
  page: Page,
  check: () => Promise<boolean>,
  opts: { timeoutMs?: number; intervalMs?: number; reloadEvery?: number } = {},
): Promise<void> {
  // 90s default (was 45s): the dev environment's Stripe webhook can take >45s
  // on a cold serverless start, so the webhook-driven roster/receipt mutation
  // lands late. The bundle-96 tip-jar test hit exactly this and was raised to
  // 90s for reliability; making it the default fixes the buy + refund polls too.
  // A satisfied condition still returns on the first check — only a genuinely
  // late (or absent) webhook waits the full window.
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const reloadEvery = opts.reloadEvery ?? 3;

  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    if (await check()) return;
    attempt++;
    if (attempt % reloadEvery === 0) {
      await page.reload().catch(() => {
        /* tolerate transient nav errors */
      });
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
    await page.waitForTimeout(intervalMs);
  }
  throw new Error(`pollUiFor: condition not satisfied within ${timeoutMs}ms`);
}

/**
 * The open-play "Sign up" panel ([event-signup-area.tsx]) is a native
 * `<details>` that **auto-collapses for a viewer who's already signed up**
 * (`defaultOpen = !viewerSignedUp`). After a paid checkout the buyer IS signed
 * up, so a fresh `page.goto(eventUrl)` renders the section collapsed and the
 * "Cancel sign-up" button sits hidden inside it — invisible to `getByRole`.
 * Call this after navigating (and inside any `pollUiFor` that reloads) to
 * reveal the post-signup controls. No-op when the section is already open or
 * absent (free events, tournaments, signed-out views).
 */
export async function expandSignupSection(page: Page): Promise<void> {
  const details = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: /sign up/i }) })
    .first();
  if ((await details.count()) === 0) return;
  // Force the disclosure open via the DOM rather than clicking the <summary> —
  // a click can be intercepted by the consent banner overlay and hang.
  await details.evaluate((el) => ((el as HTMLDetailsElement).open = true)).catch(() => {});
}

/**
 * Skip the calling test when Stripe payment flows aren't wired up on the
 * target environment. We probe by visiting /pricing — it renders even
 * without Stripe but logs a console error when the publishable key is
 * missing. A more reliable check: ensure `STRIPE_TEST_HOST_ONBOARDED` is
 * declared via env (callers set this when running locally with a
 * non-test-mode Stripe key).
 */
export function shouldSkipStripeTests(): string | null {
  if (process.env['SKIP_STRIPE_E2E'] === '1') {
    return 'SKIP_STRIPE_E2E=1 — Stripe paid-flow tests disabled for this run';
  }
  if (process.env['PLAYWRIGHT_BASE_URL']?.includes('localhost')) {
    return 'Stripe paid-flow tests require dev (webhook bridge); skipping on localhost';
  }
  return null;
}
