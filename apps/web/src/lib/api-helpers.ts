import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  CapacityExceededError,
  ConflictError,
  DomainError,
  InvariantViolation,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '@pickupvb/domain';
import { log } from './log';
import { getServerSupabase } from './supabase';

export async function requireUser() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };
  }
  return { user, response: null as null };
}

export async function getViewer() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function domainErrorStatus(err: DomainError): number {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof UnauthorizedError) return 401;
  if (err instanceof ValidationError) return 400;
  if (err instanceof CapacityExceededError) return 409;
  if (err instanceof ConflictError) return 409;
  if (err instanceof RateLimitError) return 429;
  if (err instanceof InvariantViolation) return 422;
  return 422;
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json({ error: 'VALIDATION', issues: err.issues }, { status: 400 });
  }
  if (err instanceof DomainError) {
    return NextResponse.json(
      { error: err.code, message: err.message, details: err.details },
      { status: domainErrorStatus(err) },
    );
  }
  // Unexpected error — capture full context for Sentry and return a generic
  // 500 to the client. We don't await the flush here because handleError is
  // sync; the response is sent immediately and the event is best-effort.
  void log.error('[api] unhandled error', err);
  return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
}
