'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { neutralButtonClass, primaryButtonClass } from '@/components/primary-button';
import { TeamCard, type TeamCardData } from './team-card';

type TeamsByRole = {
  captained: TeamCardData[];
  onTeams: TeamCardData[];
  pendingInvites: TeamCardData[];
};

/**
 * Renders the viewer's "My teams" sections (captained / rostered / pending
 * invites) plus the create-team CTA. Lives in a client component so the
 * surrounding `/teams` page can stay ISR-cacheable — the page body must not
 * call `cookies()` to keep the route static for anonymous traffic.
 *
 * Hydrates with three small queries against the browser-bound Supabase
 * client, which already knows the viewer's session from the auth cookies
 * the browser sends with its own fetches.
 */
export function MyTeamsPanel() {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'anon' } | { status: 'ready'; teams: TeamsByRole }
  >({ status: 'loading' });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || user.is_anonymous) {
        if (!cancelled) setState({ status: 'anon' });
        return;
      }

      const [captainedRes, memberRes] = await Promise.all([
        supabase
          .from('teams')
          .select('id, slug, name, captain_id')
          .eq('captain_id', user.id)
          .order('name', { ascending: true }),
        supabase
          .from('team_members')
          .select('status, teams:teams!inner(id, slug, name, captain_id)')
          .eq('user_id', user.id),
      ]);

      type MemberRow = {
        status: 'active' | 'pending' | null;
        teams: TeamCardData | null;
      };
      const memberships = ((memberRes.data as MemberRow[] | null) ?? []).filter(
        (r): r is MemberRow & { teams: TeamCardData } =>
          !!r.teams && r.teams.captain_id !== user.id,
      );
      const teams: TeamsByRole = {
        captained: (captainedRes.data as TeamCardData[] | null) ?? [],
        onTeams: memberships.filter((r) => (r.status ?? 'active') === 'active').map((r) => r.teams),
        pendingInvites: memberships.filter((r) => r.status === 'pending').map((r) => r.teams),
      };
      if (!cancelled) setState({ status: 'ready', teams });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    // Tiny skeleton; the listing below it still paints immediately.
    return (
      <div
        aria-hidden="true"
        className="border-border-base bg-surface/60 rounded-shape-sm h-24 animate-pulse border"
      />
    );
  }

  if (state.status === 'anon') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/login?next=/teams" className={neutralButtonClass('sm')}>
          Sign in to create a team
        </Link>
      </div>
    );
  }

  const { captained, onTeams, pendingInvites } = state.teams;
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href="/teams/new" className={primaryButtonClass('sm')}>
          + New team
        </Link>
      </div>

      {pendingInvites.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-primary text-sm font-semibold tracking-wide uppercase">
            Pending invites ({pendingInvites.length})
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {pendingInvites.map((t) => (
              <TeamCard key={t.id} team={t} role="pending" />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">
          Captained ({captained.length})
        </h2>
        {captained.length === 0 ? (
          <div className="border-border-base rounded-shape-sm flex flex-col items-center gap-3 border border-dashed p-6 text-center">
            <p className="text-fg text-sm">You don&apos;t captain any teams yet.</p>
            <Link href="/teams/new" className={primaryButtonClass()}>
              + Create your first team
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {captained.map((t) => (
              <TeamCard key={t.id} team={t} role="captain" />
            ))}
          </ul>
        )}
      </section>

      {onTeams.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">
            Rostered on ({onTeams.length})
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {onTeams.map((t) => (
              <TeamCard key={t.id} team={t} role="member" />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
