'use client';

import { useMemo } from 'react';
import type { BracketFormat, BracketStatus, Match } from '@pickupvb/domain';
import { useEventManageCaps } from '../../_components/use-event-manage-caps';
import { LiveScoresProvider } from '../../_components/live-scores-provider';
import { BoardView, pickLatestMatchId } from './board-view';
import { eventScope } from './bracket-action-binding';
import { DraftWorkspace } from './draft-workspace';
import { LatestMatchTracker } from './latest-match-tracker';
import { NoBracketView } from './no-bracket-view';
import { SetupView } from './setup-view';
import { BracketRealtimeRefresher } from './realtime-refresher';
import { EventToolsCard } from '@/app/tools/_components/event-tools-card';
import type { TeamLite } from './labels';

/** Serializable bracket state passed from the (cacheable) server page. Null
 *  when the host hasn't created the bracket yet. */
type BracketVm = {
  id: string;
  status: BracketStatus;
  format: BracketFormat;
  bestOf: number;
  targetScore: number | null;
  advancePerPool: number;
  seeds: ReadonlyArray<{ entryId: string; seed: number; pool: string | null }>;
  matches: ReadonlyArray<Match>;
};

/**
 * Client island that owns the viewer-conditional bracket render so the
 * `/events/[id]/bracket` page can stay viewer-independent and cacheable
 * (performance audit P2 #14) — mirrors the `<TeamViewerChrome />` pattern from
 * Bundle 25.
 *
 * The server page renders the static chrome (header, division nav, notices) and
 * hands this component fully serializable bracket data. We resolve the viewer's
 * `{ viewerId, canManage }` client-side with one `supabase.auth.getUser()`
 * round-trip — replicating the read model's `canManage` (primary host **or**
 * owner/admin of the host group) so the same users see the same controls as
 * before. Until that resolves we render as a spectator. Authorization is still
 * enforced server-side by the bracket actions' `assertHost` / RLS gates; this
 * gate is UX only.
 */
export function BracketWorkspace(props: {
  eventId: string;
  divisionId: string;
  hostUserId: string | null;
  hostGroupId: string | null;
  registeredTeams: ReadonlyArray<TeamLite>;
  bracket: BracketVm | null;
  liveScoringEnabled: boolean;
  focusId: string | null;
}) {
  const { eventId, divisionId, hostUserId, hostGroupId, registeredTeams, bracket } = props;
  const caps = useEventManageCaps(hostUserId, hostGroupId);

  // Dual-keyed: rows are indexed under `entryId` (FK → event_team_entries.id)
  // and — when present — `teamId` (FK → teams.id, used by pre-cutover bracket
  // data). Ad-hoc / walk-in entries have no `teams.id`, so only the entryId key
  // is set for them. See the bracket page for the full rationale.
  const teamById = useMemo(() => {
    const map = new Map<string, TeamLite>();
    for (const t of registeredTeams) {
      map.set(t.entryId, t);
      if (t.teamId) map.set(t.teamId, t);
    }
    return map;
  }, [registeredTeams]);

  const isHost = caps.canManage;

  return (
    <>
      {/* Host-gated tools row, bound to this division (tournament-tools-workflow
          audit TT-1). Rendered only after `caps` resolves the viewer as a
          manager, so it never shows to spectators on the cacheable page. */}
      {isHost && (
        <div className="border-border-base bg-fg/[0.02] rounded-shape-sm space-y-2 border p-3">
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">Host tools</p>
          <EventToolsCard
            eventId={eventId}
            divisionId={divisionId}
            ret={`/events/${eventId}/bracket?division=${divisionId}`}
            tools={['seeding', 'scheduler', 'team-randomizer']}
            heading={false}
          />
        </div>
      )}

      {!bracket && (
        <NoBracketView
          eventId={eventId}
          divisionId={divisionId}
          teamCount={registeredTeams.length}
          isHost={isHost}
        />
      )}

      <BracketRealtimeRefresher divisionId={divisionId} bracketId={bracket?.id ?? null} />

      {bracket && bracket.status === 'setup' && (
        <SetupView
          eventId={eventId}
          divisionId={divisionId}
          bracketFormat={bracket.format}
          seeds={bracket.seeds}
          registeredTeams={registeredTeams}
          isHost={isHost}
        />
      )}

      {bracket &&
        bracket.status === 'draft' &&
        (isHost ? (
          <DraftWorkspace
            scope={eventScope(eventId, divisionId)}
            format={bracket.format}
            bestOf={bracket.bestOf}
            targetScore={bracket.targetScore}
            matches={bracket.matches}
            teams={registeredTeams}
            seeds={bracket.seeds}
          />
        ) : (
          <p className="text-muted text-sm">
            The host is finalizing the bracket. Check back shortly.
          </p>
        ))}

      {bracket && (bracket.status === 'active' || bracket.status === 'completed') && (
        <LiveScoresProvider enabled={props.liveScoringEnabled} divisionId={divisionId}>
          <LatestMatchTracker
            matchId={pickLatestMatchId(bracket.matches)}
            autoScroll={false}
            initialFocusId={props.focusId}
          />
          <BoardView
            eventId={eventId}
            divisionId={divisionId}
            matches={[...bracket.matches]}
            teamById={teamById}
            teams={registeredTeams}
            bestOf={bracket.bestOf}
            targetScore={bracket.targetScore}
            advancePerPool={bracket.advancePerPool}
            isHost={isHost}
            viewerId={caps.viewerId}
            status={bracket.status}
            format={bracket.format}
            highlightMatchId={props.focusId ?? pickLatestMatchId(bracket.matches)}
            liveScoringEnabled={props.liveScoringEnabled}
          />
        </LiveScoresProvider>
      )}
    </>
  );
}
