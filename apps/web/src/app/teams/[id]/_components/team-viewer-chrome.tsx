'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { SubmitButton } from '@/components/submit-button';
import { removeMemberFromForm } from '../../actions';
import { AddTeamMemberForm } from './add-team-member-form';
import { ExtraMembersForm } from './extra-members-form';
import { CaptainBroadcastPanel } from './captain-broadcast-panel';
import { InviteResponse } from './invite-response';
import type { TeamRosterMember } from './team-member-row';

type Props = {
  teamId: string;
  teamName: string;
  captainId: string;
  members: TeamRosterMember[];
  extraMembers: number;
  activeCount: number;
  returnPath: string;
};

type ViewerState =
  | { status: 'loading' }
  | { status: 'anon' }
  | { status: 'pending' }
  | { status: 'captain' }
  | { status: 'member' };

/**
 * Renders the viewer-conditional chrome for `/teams/[id]`: pending-invite
 * accept/decline, captain controls (add member, extra-member count,
 * broadcast), and per-member remove buttons. Lives in a client island so
 * the surrounding team page can stay ISR-cacheable — the page must not
 * call `cookies()` for anonymous visitors.
 *
 * Hydrates with one `supabase.auth.getUser()` round-trip, then matches
 * the viewer against the captain id and pending-member id from props.
 */
export function TeamViewerChrome({
  teamId,
  teamName,
  captainId,
  members,
  extraMembers,
  activeCount,
  returnPath,
}: Props) {
  const [state, setState] = useState<ViewerState>({ status: 'loading' });

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
      if (user.id === captainId) {
        if (!cancelled) setState({ status: 'captain' });
        return;
      }
      const me = members.find((m) => m.userId === user.id);
      if (me?.status === 'pending') {
        if (!cancelled) setState({ status: 'pending' });
        return;
      }
      if (!cancelled) setState({ status: 'member' });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [captainId, members]);

  if (state.status === 'loading' || state.status === 'anon' || state.status === 'member') {
    return null;
  }

  if (state.status === 'pending') {
    return <InviteResponse teamId={teamId} returnPath={returnPath} teamName={teamName} />;
  }

  // captain
  const nonCaptainMembers = members.filter((m) => m.userId !== captainId);
  return (
    <>
      <AddTeamMemberForm
        teamId={teamId}
        returnPath={returnPath}
        existingMemberIds={members.map((m) => m.userId)}
      />
      <ExtraMembersForm teamId={teamId} returnPath={returnPath} value={extraMembers} />
      <CaptainBroadcastPanel teamId={teamId} memberCount={activeCount} />
      {nonCaptainMembers.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">
            Roster controls
          </h2>
          <ul className="space-y-2">
            {nonCaptainMembers.map((m) => {
              const name = memberName(m);
              const isPending = m.status === 'pending';
              return (
                <li
                  key={m.userId}
                  className="border-border-base bg-surface flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <span className="truncate text-sm">{name}</span>
                  <form action={removeMemberFromForm.bind(null, teamId, m.userId, returnPath)}>
                    <SubmitButton className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
                      {isPending ? 'Cancel' : 'Remove'}
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function memberName(m: TeamRosterMember): string {
  const p = m.profile;
  if (!p) return 'Player';
  const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return full || p.displayName || 'Player';
}
