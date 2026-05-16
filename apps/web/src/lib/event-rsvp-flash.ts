/**
 * Friendly text for `?rsvp=<code>` flash banners surfaced by server actions
 * around the event detail page (`/events/[id]`). Keep this in one place so
 * Join, Leave, position signup, ticket checkout, and guest signup all
 * speak the same language to users.
 *
 * `unknown` codes fall back to `rsvpMsg` (a free-form string echoed from
 * the action), or a generic "Something went wrong" if that's missing too.
 */
export type RsvpBannerTone = 'success' | 'info' | 'error';

export interface RsvpBanner {
    tone: RsvpBannerTone;
    text: string;
}

/**
 * Position variant of the "full" banner. The shared map below assumes a
 * generic "this event is full"; position-RSVP panels override that one
 * key to say "that position is full".
 */
export type RsvpBannerOverrides = Partial<Record<string, RsvpBanner>>;

const BASE_BANNERS: Record<string, RsvpBanner> = {
    joined: { tone: 'success', text: "You're in! See you on the court." },
    guest_joined: {
        tone: 'success',
        text: "You're in! Save your RSVPs across devices — finish creating your account.",
    },
    already: { tone: 'info', text: "You're already signed up for this event." },
    left: { tone: 'info', text: "You've been removed from this event." },
    notin: { tone: 'info', text: "You weren't signed up for this event." },
    full: { tone: 'error', text: 'Sorry — this event is full.' },
    cancel: { tone: 'info', text: 'Checkout cancelled. You can try again any time.' },

    // Auth states
    signin: { tone: 'error', text: 'Please sign in to RSVP.' },
    anon: {
        tone: 'info',
        text: 'Finish creating your account to RSVP from any device.',
    },

    // Payment-specific
    payments_off: {
        tone: 'error',
        text: "Payments aren't set up on this server yet — try a free event for now.",
    },
    host_not_ready: {
        tone: 'error',
        text: "The host hasn't finished payment setup. Try again later, or message them directly.",
    },
    not_paid_event: {
        tone: 'info',
        text: 'This is a free event — no checkout needed. Tap Join to sign up.',
    },
    event_not_found: {
        tone: 'error',
        text: "We couldn't find that event. It may have been removed.",
    },
    bad_name: { tone: 'error', text: 'Please enter your name to continue.' },
    bad_email: {
        tone: 'error',
        text: 'A valid email is required so we can send your receipt.',
    },
    session_failed: {
        tone: 'error',
        text: "We couldn't start a guest session — check back shortly.",
    },
    stripe_failed: {
        tone: 'error',
        text: "Stripe didn't respond — please try again in a moment.",
    },
};

/**
 * Resolve a banner for a `?rsvp=<code>` querystring value.
 *
 * @param code raw `rsvp` querystring value
 * @param msg  optional free-form `rsvp_msg` echo from the action
 * @param overrides optional per-panel code overrides (e.g. position panel
 *                  swaps `full` to a position-specific copy)
 */
export function rsvpBannerFor(
    code: string | undefined,
    msg: string | undefined,
    overrides?: RsvpBannerOverrides,
): RsvpBanner | null {
    if (!code) return null;
    const override = overrides?.[code];
    if (override) return override;
    const known = BASE_BANNERS[code];
    if (known) return known;
    if (code === 'error') {
        return { tone: 'error', text: msg ?? 'Something went wrong. Try again.' };
    }
    return null;
}

export const RSVP_BANNER_CLASS: Record<RsvpBannerTone, string> = {
    success:
        'rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary',
    error:
        'rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700',
    info: 'rounded-md border border-border-base bg-highlight/30 px-4 py-2 text-sm text-fg/80',
};
