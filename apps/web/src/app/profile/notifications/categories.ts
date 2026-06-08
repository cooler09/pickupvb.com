/**
 * Per-category notification preference rows for the settings matrix
 * (notifications audit P3). The dispatch layer already honors
 * `channel_overrides[category][channel]` — this exposes a UI to set it.
 *
 * Two design choices keep the matrix honest:
 *   - **Transactional categories are never shown.** They can't be disabled
 *     (CAN-SPAM / account-critical), matching `channelAllowedByPrefs`.
 *   - **A category only shows the channels its kinds actually send on.** An
 *     override can only *subtract* from the master toggle, never add, so
 *     offering "Email" for an in-app-only category (e.g. Social) would be a
 *     dead control. The channel set is derived from the kind registry, so it
 *     stays correct as kinds change.
 *
 * Shared by the page (renders the rows) and the action (rebuilds the overrides
 * from the submitted form), so both iterate the exact same (category, channel)
 * pairs — a checkbox only submits when checked, so the writer must know the full
 * set to record the unchecked ones as `false`.
 */
import {
  KIND_CATEGORY,
  KIND_DEFAULT_CHANNELS,
  TRANSACTIONAL_CATEGORIES,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationKind,
} from '@pickupvb/notifications';

/** Channels a user can fine-tune per category (SMS is not wired; in_app/email/push are). */
export const CONTROLLABLE_CHANNELS = [
  'in_app',
  'email',
  'push',
] as const satisfies readonly NotificationChannel[];
export type ControllableChannel = (typeof CONTROLLABLE_CHANNELS)[number];

export const CHANNEL_LABEL: Record<ControllableChannel, string> = {
  in_app: 'In-app',
  email: 'Email',
  push: 'Push',
};

/** Display order + copy for the non-transactional categories. */
const CATEGORY_META: { category: NotificationCategory; label: string; description: string }[] = [
  {
    category: 'event_reminders',
    label: 'Event reminders & updates',
    description: 'Upcoming-event reminders, schedule changes, league matches.',
  },
  {
    category: 'waitlist',
    label: 'Waitlist openings',
    description: 'A spot opened up on an event you waitlisted.',
  },
  {
    category: 'messages',
    label: 'Messages',
    description: 'Direct messages and team/event/group chat.',
  },
  {
    category: 'group_activity',
    label: 'Team & group activity',
    description: 'Team invites and free-agent pickups.',
  },
  {
    category: 'broadcasts',
    label: 'Host announcements',
    description: 'Messages a host or group owner sends to everyone.',
  },
  {
    category: 'social',
    label: 'Social',
    description: 'New followers and badges you earn.',
  },
  {
    category: 'host_payouts',
    label: 'Payouts',
    description: 'Stripe payout confirmations (hosts).',
  },
];

export type CategoryRow = {
  category: NotificationCategory;
  label: string;
  description: string;
  channels: ControllableChannel[];
};

/** The channels each non-transactional category actually sends on, in CONTROLLABLE order. */
function channelsByCategory(): Map<NotificationCategory, Set<ControllableChannel>> {
  const map = new Map<NotificationCategory, Set<ControllableChannel>>();
  for (const [kind, category] of Object.entries(KIND_CATEGORY) as [
    NotificationKind,
    NotificationCategory,
  ][]) {
    if (TRANSACTIONAL_CATEGORIES.has(category)) continue;
    const set = map.get(category) ?? new Set<ControllableChannel>();
    for (const channel of KIND_DEFAULT_CHANNELS[kind]) {
      if ((CONTROLLABLE_CHANNELS as readonly string[]).includes(channel)) {
        set.add(channel as ControllableChannel);
      }
    }
    map.set(category, set);
  }
  return map;
}

/** The rows to render, each carrying only the channels it can actually toggle. */
export function categoryRows(): CategoryRow[] {
  const byCategory = channelsByCategory();
  const rows: CategoryRow[] = [];
  for (const meta of CATEGORY_META) {
    const set = byCategory.get(meta.category);
    if (!set || set.size === 0) continue;
    rows.push({
      ...meta,
      channels: CONTROLLABLE_CHANNELS.filter((c) => set.has(c)),
    });
  }
  return rows;
}

/** Form field name for one (category, channel) opt-out checkbox. */
export function overrideFieldName(category: string, channel: ControllableChannel): string {
  return `ov__${category}__${channel}`;
}
