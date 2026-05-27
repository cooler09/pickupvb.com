/**
 * Cookie that suppresses the "switch to on-platform payments" upsell banner
 * shown to hosts of off-platform events (audit P2 #7, shipped Bundle 100).
 *
 * Single-occurrence per browser — dismissing once hides the banner for
 * ~1 year. Soft nudge: the page only renders the banner for the event's
 * host, and even hosts can opt out permanently with one click.
 *
 * Path-global rather than per-event or per-user: once a host has seen the
 * pitch on any of their off-platform events, repeating it on every event
 * (or every device) is nag-y for a soft growth lever.
 */
export const OFF_PLATFORM_UPSELL_COOKIE = 'pickupvb_op_upsell_dismissed';
