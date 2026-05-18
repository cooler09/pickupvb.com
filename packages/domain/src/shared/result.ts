/**
 * Result type for command/query handlers (CQRS).
 * Avoids throwing for expected business errors.
 */
export type Result<T, E = DomainError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class InvariantViolation extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('INVARIANT_VIOLATION', message, details);
    this.name = 'InvariantViolation';
  }
}

/**
 * Aggregate or related row not found.
 * Maps to HTTP 404. UI typically shows a "not found" page or silently no-ops.
 */
export class NotFoundError extends DomainError {
  constructor(
    public readonly resource: string,
    public readonly resourceId?: string,
    message?: string,
  ) {
    super(
      'NOT_FOUND',
      message ?? (resourceId ? `${resource} ${resourceId} not found.` : `${resource} not found.`),
      resourceId ? { resource, resourceId } : { resource },
    );
    this.name = 'NotFoundError';
  }
}

/**
 * State conflict — the action is valid in the abstract but not in the current
 * state of the aggregate (e.g. user already RSVPed, team already registered).
 * Maps to HTTP 409.
 */
export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}

/**
 * Capacity-bounded resource has no room left (event full, team roster full).
 * Maps to HTTP 409. Distinct from ConflictError because it's the most common
 * failure mode for RSVP and deserves a dedicated UI message.
 */
export class CapacityExceededError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CAPACITY_EXCEEDED', message, details);
    this.name = 'CapacityExceededError';
  }
}

/**
 * Caller is not authorized for the operation. Maps to HTTP 401/403.
 */
export class UnauthorizedError extends DomainError {
  constructor(message = 'Not authorized.', details?: Record<string, unknown>) {
    super('UNAUTHORIZED', message, details);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Input failed validation at the application boundary (bad command shape,
 * missing required field, etc). Distinct from InvariantViolation, which is
 * for *aggregate-internal* invariant failures. Maps to HTTP 400.
 */
export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION', message, details);
    this.name = 'ValidationError';
  }
}

/**
 * Caller has exceeded a rate limit (e.g. submitted too many community
 * listings in a 24-hour window). Maps to HTTP 429.
 */
export class RateLimitError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('RATE_LIMIT_EXCEEDED', message, details);
    this.name = 'RateLimitError';
  }
}
