/**
 * Result type for command/query handlers (CQRS).
 * Avoids throwing for expected business errors.
 */
export type Result<T, E = DomainError> =
    | { ok: true; value: T }
    | { ok: false; error: E };

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
