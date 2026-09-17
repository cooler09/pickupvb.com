import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The 2026-09 card-testing incident was discovered because *Stripe* flagged the
 * accounts — the platform learned about its own fraud from a third party, hours
 * after the money moved. These signals exist to shorten that.
 *
 * Two behaviours are load-bearing and pinned here:
 *
 *  1. **Alerts dedupe.** A sustained attack must produce one alert per subject
 *     per hour, not one per declined card. An alert channel that emits 110 times
 *     in an afternoon trains everyone to mute it, which is the same as having no
 *     detection at all.
 *  2. **Signals never throw.** They run inside a Stripe webhook and the
 *     event-creation action; telemetry failing must never fail real work.
 */
const consumeRateLimit = vi.fn();
const logError = vi.fn();
const isUnprovenHost = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('./rate-limit', () => ({
  consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...a),
  rateLimitKey: (scope: string, _d: string, v: string) => `${scope}:${v}`,
}));
vi.mock('./log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('./host-account-age', () => ({
  isUnprovenHost: (...a: unknown[]) => isUnprovenHost(...a),
}));

const allow = { allowed: true, retryAfterSeconds: 0 };
const deny = { allowed: false, retryAfterSeconds: 900 };

beforeEach(() => {
  vi.clearAllMocks();
  isUnprovenHost.mockResolvedValue(true);
});

describe('card-decline burst', () => {
  it('stays quiet while declines are under the threshold', async () => {
    const { recordCardDecline } = await import('./fraud-signals');
    consumeRateLimit.mockResolvedValue(allow);

    await recordCardDecline('evt-1');

    expect(logError).not.toHaveBeenCalled();
  });

  it('alerts once the per-event decline rate crosses the threshold', async () => {
    const { recordCardDecline } = await import('./fraud-signals');
    // 1st call = the counter (denied → threshold crossed), 2nd = alert slot (free).
    consumeRateLimit.mockResolvedValueOnce(deny).mockResolvedValueOnce(allow);

    await recordCardDecline('evt-1');

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]?.[2]).toMatchObject({ eventId: 'evt-1' });
  });

  it('does NOT alert again once the slot for that event is claimed', async () => {
    const { recordCardDecline } = await import('./fraud-signals');
    // Counter denied (still over threshold), alert slot denied (already alerted).
    consumeRateLimit.mockResolvedValueOnce(deny).mockResolvedValueOnce(deny);

    await recordCardDecline('evt-1');

    expect(logError).not.toHaveBeenCalled();
  });

  it('swallows limiter failures rather than failing the Stripe webhook', async () => {
    const { recordCardDecline } = await import('./fraud-signals');
    consumeRateLimit.mockRejectedValue(new Error('db down'));

    await expect(recordCardDecline('evt-1')).resolves.toBeUndefined();
  });
});

describe('new-host event-creation velocity', () => {
  it('ignores established hosts — scheduling a week of open plays is normal', async () => {
    const { recordNewHostEventCreated } = await import('./fraud-signals');
    isUnprovenHost.mockResolvedValue(false);

    await recordNewHostEventCreated({ hostId: 'h1', eventId: 'e1' });

    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('alerts when an unproven host exceeds the daily create rate', async () => {
    const { recordNewHostEventCreated } = await import('./fraud-signals');
    consumeRateLimit.mockResolvedValueOnce(deny).mockResolvedValueOnce(allow);

    await recordNewHostEventCreated({ hostId: 'h1', eventId: 'e1' });

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]?.[2]).toMatchObject({ hostId: 'h1' });
  });

  it('never fails event creation because telemetry failed', async () => {
    const { recordNewHostEventCreated } = await import('./fraud-signals');
    isUnprovenHost.mockRejectedValue(new Error('boom'));

    await expect(
      recordNewHostEventCreated({ hostId: 'h1', eventId: 'e1' }),
    ).resolves.toBeUndefined();
  });
});

describe('new-host cap hit', () => {
  it('alerts on the first trip — caps sit far above organic demand', async () => {
    const { recordNewHostCapHit } = await import('./fraud-signals');
    consumeRateLimit.mockResolvedValue(allow);

    await recordNewHostCapHit({ eventId: 'e1', hostId: 'h1' });

    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('dedupes repeat trips within the window', async () => {
    const { recordNewHostCapHit } = await import('./fraud-signals');
    consumeRateLimit.mockResolvedValue(deny);

    await recordNewHostCapHit({ eventId: 'e1', hostId: 'h1' });

    expect(logError).not.toHaveBeenCalled();
  });
});
