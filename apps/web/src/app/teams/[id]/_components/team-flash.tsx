'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MAX_TEAM_ROSTER } from '@pickupvb/domain';
import { Alert, type AlertVariant } from '@/components/alert';

/**
 * Renders the post-action flash banner on `/teams/[id]` from the redirect
 * query param the captain/roster server actions set (`?roster=…`,
 * `?invite=…`, `?team=…`, `?broadcast=sent`). Reads the param **client-side**
 * via `useSearchParams()` so the surrounding team page stays ISR-cacheable —
 * awaiting `searchParams` in the RSC body would force the page dynamic for
 * anonymous traffic. No `useAlertReveal` needed: a redirect resets scroll to
 * the top, where this banner sits (AGENTS.md pattern #15).
 */
const FLASH: Record<string, Record<string, { variant: AlertVariant; msg: string }>> = {
  roster: {
    added: { variant: 'success', msg: 'Teammate added to the roster.' },
    invited: {
      variant: 'success',
      msg: 'Invite sent — they’ll appear on the roster once they accept.',
    },
    removed: { variant: 'success', msg: 'Removed from the roster.' },
    offsite: { variant: 'success', msg: 'Off-site player count updated.' },
    cap: {
      variant: 'error',
      msg: `Your roster is full (max ${MAX_TEAM_ROSTER}). Remove someone before adding another player.`,
    },
    private: { variant: 'error', msg: 'That player isn’t accepting team invites.' },
    error: { variant: 'error', msg: 'Couldn’t update the roster. Please try again.' },
  },
  invite: {
    accepted: { variant: 'success', msg: 'You’re on the roster!' },
    declined: { variant: 'success', msg: 'Invite declined.' },
    error: { variant: 'error', msg: 'Couldn’t respond to the invite. Please try again.' },
  },
  team: {
    renamed: { variant: 'success', msg: 'Team renamed.' },
    invalid: { variant: 'error', msg: 'That team name isn’t allowed — use 1–80 characters.' },
    error: { variant: 'error', msg: 'Couldn’t rename the team. Please try again.' },
  },
  broadcast: {
    sent: { variant: 'success', msg: 'Message sent to your active roster.' },
  },
};

function TeamFlashInner() {
  const sp = useSearchParams();
  for (const [param, values] of Object.entries(FLASH)) {
    const v = sp.get(param);
    if (v && values[v]) {
      const { variant, msg } = values[v]!;
      return <Alert variant={variant}>{msg}</Alert>;
    }
  }
  return null;
}

export function TeamFlash() {
  return (
    <Suspense fallback={null}>
      <TeamFlashInner />
    </Suspense>
  );
}
