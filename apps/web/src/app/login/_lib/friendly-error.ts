export type AuthMode = 'sign-in' | 'sign-up';

/**
 * Translate a raw Supabase auth error message into a user-friendly one.
 * Falls back to the original message when no rule matches. Mode-aware so
 * "invalid login credentials" can suggest signing up instead during sign-in.
 */
export function friendlyAuthError(message: string, mode: AuthMode): string {
    const m = message.toLowerCase();
    if (m.includes('invalid login credentials')) {
        return mode === 'sign-in'
            ? "We couldn't find an account with that email and password. Want to sign up instead?"
            : message;
    }
    if (m.includes('user already registered') || m.includes('already exists')) {
        return 'An account with that email already exists. Try signing in.';
    }
    if (m.includes('email not confirmed')) {
        return 'Please confirm your email first — check your inbox for the link.';
    }
    if (m.includes('password should be')) {
        return 'Password must be at least 8 characters.';
    }
    return message;
}
