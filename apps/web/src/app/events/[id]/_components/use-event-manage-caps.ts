'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

export type EventManageCaps = {
  /** The signed-in, non-anonymous viewer's id, or null. Used for captain checks. */
  viewerId: string | null;
  /** True when the viewer may manage the event (host or host-group owner/admin). */
  canManage: boolean;
  /**
   * False until the post-hydration `auth.getUser()` round-trip resolves, then
   * true. Lets a caller distinguish "still resolving" from "resolved as a
   * spectator" (both are `canManage: false`) — e.g. to hold back spectator copy
   * that would otherwise flash for a host before their controls load.
   */
  resolved: boolean;
};

/**
 * Resolves the viewer's `{ viewerId, canManage }` client-side so a page can
 * render the static, viewer-independent shell on the server and stay cacheable
 * (performance audit P2 #14). Mirrors the `<TeamViewerChrome />` pattern
 * (Bundle 25) — one `supabase.auth.getUser()` round-trip after hydration.
 *
 * `canManage` replicates the `EventDetailReadModel.canManage` rule: the primary
 * host, **or** an owner/admin of the host group. The group-membership read is
 * self-scoped (the viewer's own row). This gate is UX only — every mutating
 * action re-checks authorization server-side via `assertHost` / RLS.
 *
 * Starts as a spectator (`{ viewerId: null, canManage: false, resolved: false }`)
 * until resolved.
 */
export function useEventManageCaps(
  hostUserId: string | null,
  hostGroupId: string | null,
): EventManageCaps {
  const [caps, setCaps] = useState<EventManageCaps>({
    viewerId: null,
    canManage: false,
    resolved: false,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    async function resolve() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || user.is_anonymous) {
        if (!cancelled) setCaps({ viewerId: null, canManage: false, resolved: true });
        return;
      }
      const viewerId = user.id;
      if (viewerId === hostUserId) {
        if (!cancelled) setCaps({ viewerId, canManage: true, resolved: true });
        return;
      }
      if (hostGroupId) {
        const { data: membership } = await supabase
          .from('group_members')
          .select('role')
          .eq('group_id', hostGroupId)
          .eq('user_id', viewerId)
          .maybeSingle();
        const role = (membership as { role: string } | null)?.role;
        if (role === 'owner' || role === 'admin') {
          if (!cancelled) setCaps({ viewerId, canManage: true, resolved: true });
          return;
        }
      }
      if (!cancelled) setCaps({ viewerId, canManage: false, resolved: true });
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [hostUserId, hostGroupId]);

  return caps;
}
