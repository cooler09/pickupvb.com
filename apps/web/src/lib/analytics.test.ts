import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalyticsEvent, AnalyticsPort } from '@pickupvb/domain';

const sampleEvent: AnalyticsEvent = {
  name: 'signup_completed',
  props: { method: 'email' },
};

// Capture the most-recent promise handed to `after()` so we can assert on
// it. The serverless flush race fix (bundle 101) depends on every
// consent-gated capture being wrapped in `after()`; without it the
// Vercel lambda freezes before posthog-node's HTTP flush lands.
const afterMock = vi.fn<(p: Promise<unknown>) => void>();

vi.mock('next/server', () => ({
  after: (p: Promise<unknown>) => afterMock(p),
}));

const consentMock = vi.fn<() => Promise<boolean>>();
vi.mock('./consent', () => ({
  hasAnalyticsConsent: () => consentMock(),
}));

// Stub the infrastructure module so importing `./analytics` doesn't try
// to construct a real PostHog client (which would read env vars and
// open a network socket). We don't care about the factory here — the
// `ConsentGatedAnalytics` wrapper is what we're testing.
vi.mock('@pickupvb/infrastructure', () => ({
  analyticsFromEnv: (): AnalyticsPort => ({
    capture: () => {},
    identify: () => {},
    shutdown: async () => {},
  }),
}));

// Import after mocks are registered.
const { ConsentGatedAnalytics } = await import('./analytics');

function makeInner() {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    shutdown: vi.fn(async () => {}),
  } satisfies AnalyticsPort & {
    capture: ReturnType<typeof vi.fn>;
    identify: ReturnType<typeof vi.fn>;
  };
}

describe('ConsentGatedAnalytics', () => {
  beforeEach(() => {
    afterMock.mockClear();
    consentMock.mockReset();
  });

  it('hands every capture to next/server `after()`', async () => {
    consentMock.mockResolvedValue(true);
    const inner = makeInner();
    const gated = new ConsentGatedAnalytics(inner);

    gated.capture(sampleEvent);

    expect(afterMock).toHaveBeenCalledTimes(1);
    const pending = afterMock.mock.calls[0]?.[0];
    expect(pending).toBeInstanceOf(Promise);
    await pending;
    expect(inner.capture).toHaveBeenCalledTimes(1);
  });

  it('hands every identify to next/server `after()`', async () => {
    consentMock.mockResolvedValue(true);
    const inner = makeInner();
    const gated = new ConsentGatedAnalytics(inner);

    gated.identify('user-1', { metroId: 'metro-1' });

    expect(afterMock).toHaveBeenCalledTimes(1);
    await afterMock.mock.calls[0]?.[0];
    expect(inner.identify).toHaveBeenCalledTimes(1);
  });

  it('skips the inner capture when consent is denied', async () => {
    consentMock.mockResolvedValue(false);
    const inner = makeInner();
    const gated = new ConsentGatedAnalytics(inner);

    gated.capture(sampleEvent);

    expect(afterMock).toHaveBeenCalledTimes(1);
    await afterMock.mock.calls[0]?.[0];
    expect(inner.capture).not.toHaveBeenCalled();
  });

  it('falls through to the inner adapter when no request scope is available', async () => {
    consentMock.mockRejectedValue(new Error('No request scope'));
    const inner = makeInner();
    const gated = new ConsentGatedAnalytics(inner);

    gated.capture(sampleEvent);

    expect(afterMock).toHaveBeenCalledTimes(1);
    await afterMock.mock.calls[0]?.[0];
    expect(inner.capture).toHaveBeenCalledTimes(1);
  });
});
