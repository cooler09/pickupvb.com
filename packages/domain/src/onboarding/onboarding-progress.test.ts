import { describe, expect, it } from 'vitest';
import { HOST_ONBOARDING_STEPS, PLAYER_ONBOARDING_STEPS } from './onboarding-catalog.js';
import { progressFor } from './onboarding-progress.js';
import {
  emptyHostOnboardingSnapshot,
  emptyPlayerOnboardingSnapshot,
  type HostOnboardingSnapshot,
  type PlayerOnboardingSnapshot,
} from './onboarding-snapshot.js';

const player = (overrides: Partial<PlayerOnboardingSnapshot>): PlayerOnboardingSnapshot => ({
  ...emptyPlayerOnboardingSnapshot(),
  ...overrides,
});
const host = (overrides: Partial<HostOnboardingSnapshot>): HostOnboardingSnapshot => ({
  ...emptyHostOnboardingSnapshot(),
  ...overrides,
});

const playerProgress = (s: PlayerOnboardingSnapshot) => progressFor(PLAYER_ONBOARDING_STEPS, s);
const hostProgress = (s: HostOnboardingSnapshot) => progressFor(HOST_ONBOARDING_STEPS, s);
const doneKeys = (p: ReturnType<typeof progressFor>) =>
  p.steps.filter((s) => s.done).map((s) => s.key);

describe('player onboarding progress', () => {
  it('marks nothing done for a brand-new account, card stays visible', () => {
    const p = playerProgress(emptyPlayerOnboardingSnapshot());
    expect(doneKeys(p)).toEqual([]);
    expect(p.requiredComplete).toBe(false);
    expect(p.allComplete).toBe(false);
  });

  it('complete-profile needs BOTH a home city and at least one position', () => {
    expect(doneKeys(playerProgress(player({ hasHomeCity: true })))).not.toContain(
      'complete-profile',
    );
    expect(doneKeys(playerProgress(player({ positionCount: 2 })))).not.toContain(
      'complete-profile',
    );
    expect(doneKeys(playerProgress(player({ hasHomeCity: true, positionCount: 1 })))).toContain(
      'complete-profile',
    );
  });

  it('hides the card once the REQUIRED steps are done, even with optionals open', () => {
    // Profile complete + joined an event, but no group and no message.
    const p = playerProgress(player({ hasHomeCity: true, positionCount: 1, joinedEventCount: 1 }));
    expect(p.requiredComplete).toBe(true); // → card hides, no eternal nag
    expect(p.allComplete).toBe(false); // optionals (group/message) still open
    expect(p.requiredTotal).toBe(2);
    expect(p.requiredDone).toBe(2);
  });

  it('optional steps never count toward the required rollup', () => {
    // Only optional steps done — required rollup is still empty.
    const p = playerProgress(player({ groupCount: 3, messagesSent: 5 }));
    expect(p.requiredDone).toBe(0);
    expect(p.requiredComplete).toBe(false);
    expect(doneKeys(p)).toEqual(['join-group', 'send-message']);
  });

  it('allComplete is true only when every step incl. optionals is done', () => {
    const p = playerProgress(
      player({
        hasHomeCity: true,
        positionCount: 1,
        joinedEventCount: 1,
        groupCount: 1,
        messagesSent: 1,
      }),
    );
    expect(p.allComplete).toBe(true);
  });
});

describe('host onboarding progress', () => {
  it('marks nothing done for a fresh host', () => {
    const p = hostProgress(emptyHostOnboardingSnapshot());
    expect(doneKeys(p)).toEqual([]);
    expect(p.requiredComplete).toBe(false);
  });

  it('a free-only host who never connects Stripe still completes the required track', () => {
    const p = hostProgress(host({ eventsCreated: 1, publishedEventCount: 1 }));
    expect(p.requiredComplete).toBe(true); // Stripe is optional → card hides
    expect(p.allComplete).toBe(false);
    expect(doneKeys(p)).toEqual(['create-event', 'publish-event']);
  });

  it('connect-stripe is optional and tracks chargesEnabled', () => {
    expect(doneKeys(hostProgress(host({ stripeChargesEnabled: true })))).toContain(
      'connect-stripe',
    );
    const stripeStep = hostProgress(host({})).steps.find((s) => s.key === 'connect-stripe');
    expect(stripeStep?.optional).toBe(true);
  });

  it('first-registration is an optional payoff that tracks an external signup', () => {
    const step = hostProgress(host({})).steps.find((s) => s.key === 'first-registration');
    expect(step?.optional).toBe(true);
    expect(doneKeys(hostProgress(host({ firstRegistrationReceived: true })))).toContain(
      'first-registration',
    );
    // Optional → never counts toward the required rollup, so it can't keep the
    // card alive once create + publish are done.
    const p = hostProgress(host({ eventsCreated: 1, publishedEventCount: 1 }));
    expect(p.requiredComplete).toBe(true);
    expect(doneKeys(p)).not.toContain('first-registration');
  });
});
