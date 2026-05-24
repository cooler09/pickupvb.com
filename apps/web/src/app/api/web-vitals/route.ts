import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analytics } from '@/lib/handlers';
import { getViewer } from '@/lib/server-auth';

/**
 * Web-vitals beacon endpoint. The browser POSTs one sample at a time
 * via `navigator.sendBeacon` from
 * `apps/web/src/components/web-vitals-client.tsx`.
 *
 * Why a server beacon rather than a client-side PostHog SDK call:
 *  - PostHog only lives in the infrastructure adapter (server-side
 *    `posthog-node`); we don't ship a browser SDK. Keeping all capture
 *    behind one port also means the PII guardrail test stays the
 *    single source of truth for what reaches the vendor.
 *  - `sendBeacon` survives unload (which is when LCP/CLS often
 *    finalize), so a server hop is robust.
 *
 * Privacy:
 *  - The actor id (`user.id`) is hashed by the adapter; the raw value
 *    never leaves the process.
 *  - The payload is allowlisted by `vitalSchema`. Anything not in the
 *    schema (e.g. a `referer`, IP, query string) is rejected; we never
 *    forward the request headers to PostHog.
 */

const vitalSchema = z.object({
  metric: z.enum(['LCP', 'CLS', 'INP', 'FCP', 'TTFB', 'FID']),
  value: z.number().finite().min(0).max(1_000_000),
  rating: z.enum(['good', 'needs-improvement', 'poor']).nullable(),
  route: z
    .string()
    .min(1)
    .max(256)
    // Reject anything that looks like a query string or fragment — we
    // only want the pathname template.
    .regex(/^\/[^?#]*$/),
  navigationType: z.string().min(1).max(64).nullable(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const raw: unknown = await request.json();
    const parsed = vitalSchema.safeParse(raw);
    if (!parsed.success) {
      // Fail-quiet on bad input — analytics must never look like a
      // useful endpoint to probe.
      return NextResponse.json({ ok: true }, { status: 204 });
    }
    let actorId: string | undefined;
    try {
      const viewer = await getViewer();
      if (viewer && !viewer.isAnonymous) actorId = viewer.user.id;
    } catch {
      // Anonymous capture is the expected path for most page loads.
    }
    analytics.capture({ name: 'web_vitals', props: parsed.data }, actorId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }, { status: 204 });
  }
}
