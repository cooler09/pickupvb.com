import { ValidationError } from '../shared/result.js';

// Minimal URL global declaration. The domain package intentionally avoids
// importing from `node:*` (to stay framework-free); the WHATWG `URL`
// constructor is available in every modern JS runtime (Node 18+, browsers,
// edge runtimes), so we declare its shape locally.
declare const URL: {
  new (input: string): { protocol: string; hostname: string; toString(): string };
};

/**
 * Validated external URL for a community listing.
 *
 * Rules:
 *   - Must parse as an absolute URL.
 *   - Scheme must be `https:` (we don't allow `http:` for outbound links).
 *   - Hostname must not be one of our own domains — listings exist to point
 *     at *off-platform* sources. Internal links should be regular events.
 *
 * Failures throw `ValidationError` rather than returning a Result; callers
 * are expected to validate at the form/handler boundary.
 */
export class ExternalUrl {
  private static readonly BLOCKED_HOSTS = new Set<string>([
    'pickupvb.com',
    'www.pickupvb.com',
    'dev.pickupvb.com',
    'localhost',
    '127.0.0.1',
  ]);

  private constructor(public readonly value: string) {}

  static create(raw: string): ExternalUrl {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
      throw new ValidationError('External URL is required.');
    }
    let parsed: { protocol: string; hostname: string; toString(): string };
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new ValidationError('External URL must be a valid absolute URL.');
    }
    if (parsed.protocol !== 'https:') {
      throw new ValidationError('External URL must use https.');
    }
    const host = parsed.hostname.toLowerCase();
    if (ExternalUrl.BLOCKED_HOSTS.has(host)) {
      throw new ValidationError('External URL must point to an off-platform source.');
    }
    return new ExternalUrl(parsed.toString());
  }

  /** Bypass validation — only for hydrating already-stored values. */
  static fromPersistence(value: string): ExternalUrl {
    return new ExternalUrl(value);
  }

  toString(): string {
    return this.value;
  }
}
