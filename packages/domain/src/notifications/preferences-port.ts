/**
 * User-facing notification **preference settings** port (ADR 0022) — the
 * settings page where a user reads and toggles their own channel preferences.
 *
 * Distinct from the fan-out's `NotificationOutboxPort.loadPreferences`, which
 * runs on the admin client and returns the dispatch-shaped projection
 * (`channelOverrides`, `smsOptedOutAt`). This one is **user-scoped** — run on
 * the viewer's session client so RLS enforces self read/write — and exposes the
 * settings-page shape.
 */

export interface NotificationPreferenceSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  smsPhone: string | null;
  smsOptedInAt: string | null;
}

/** The channel toggles the settings form writes. */
export interface NotificationChannelToggles {
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
}

export interface NotificationPreferencesPort {
  /** The viewer's saved settings, or `null` if no row exists yet. */
  find(userId: string): Promise<NotificationPreferenceSettings | null>;
  /** Upsert the channel toggles (the row may pre-date the signup trigger). */
  upsertChannels(userId: string, toggles: NotificationChannelToggles): Promise<void>;
}
