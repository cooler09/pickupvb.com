'use client';

import { useMemo } from 'react';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { clearScheduleFromForm } from '../actions';
import { useEventManageCaps } from '../../_components/use-event-manage-caps';
import { LiveScoresProvider } from '../../_components/live-scores-provider';
import {
  AddMatchForm,
  GenerateScheduleForm,
  MatchRow,
  type ScheduleMatchVm,
  type ScheduleTeam,
} from './match-row';

/**
 * Client island that owns the viewer-conditional schedule render so the
 * `/events/[id]/schedule` page stays viewer-independent and cacheable
 * (performance audit P2 #14). Resolves `canManage` client-side via
 * {@link useEventManageCaps}; until it resolves the slate renders read-only
 * (no add/edit/record controls). Authorization is enforced server-side by the
 * league-schedule actions — this gate is UX only.
 */
export function ScheduleWorkspace(props: {
  eventId: string;
  divisionId: string;
  hostUserId: string | null;
  hostGroupId: string | null;
  returnPath: string;
  timeZone: string | null;
  teams: ReadonlyArray<ScheduleTeam>;
  matches: ReadonlyArray<ScheduleMatchVm>;
  liveScoringEnabled: boolean;
  /** Kiosk display mode (tournament-displays slice A): force the read-only
   *  spectator slate even for a signed-in host, so a gym TV shows no edit
   *  affordances. */
  display?: boolean;
}) {
  const { eventId, divisionId, returnPath, timeZone, teams, matches } = props;
  const { canManage } = useEventManageCaps(props.hostUserId, props.hostGroupId);
  // Display mode never shows host controls, regardless of who's viewing.
  const showHostControls = !props.display && canManage;

  const { weeks, matchesByWeek, defaultWeek } = useMemo(() => {
    const byWeek = new Map<number, ScheduleMatchVm[]>();
    for (const m of matches) {
      const list = byWeek.get(m.weekNumber);
      if (list) list.push(m);
      else byWeek.set(m.weekNumber, [m]);
    }
    const sortedWeeks = [...byWeek.keys()].sort((a, b) => a - b);
    return {
      weeks: sortedWeeks,
      matchesByWeek: byWeek,
      defaultWeek: sortedWeeks.length > 0 ? sortedWeeks[sortedWeeks.length - 1]! : 1,
    };
  }, [matches]);

  return (
    <>
      {showHostControls && matches.length === 0 && teams.length >= 2 && (
        // Empty slate: offer one-click round-robin generation. Hidden once
        // matches exist — regenerating requires clearing first (the handler
        // refuses to overwrite a non-empty slate).
        <section className="space-y-2">
          <h2 className="text-fg text-base font-semibold">Generate season schedule</h2>
          <GenerateScheduleForm
            eventId={eventId}
            divisionId={divisionId}
            returnPath={returnPath}
            teamCount={teams.length}
          />
        </section>
      )}

      {showHostControls && (
        <section className="space-y-2">
          <h2 className="text-fg text-base font-semibold">Add a match</h2>
          <AddMatchForm
            eventId={eventId}
            divisionId={divisionId}
            returnPath={returnPath}
            teams={teams}
            defaultWeek={defaultWeek}
          />
        </section>
      )}

      {weeks.length === 0 ? (
        <p className="text-muted text-sm">No matches have been scheduled yet.</p>
      ) : (
        <LiveScoresProvider enabled={props.liveScoringEnabled} divisionId={divisionId}>
          <div className="space-y-6">
            {weeks.map((w) => (
              <section key={w} className="space-y-2">
                <h2 className="text-fg text-sm font-semibold">Week {w}</h2>
                <ul className="space-y-2">
                  {matchesByWeek.get(w)!.map((m) => (
                    <MatchRow
                      key={m.id}
                      eventId={eventId}
                      divisionId={divisionId}
                      matchId={m.id}
                      returnPath={returnPath}
                      match={m}
                      teams={teams}
                      timeZone={timeZone}
                      isHost={showHostControls}
                      liveScoringEnabled={props.liveScoringEnabled}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </LiveScoresProvider>
      )}

      {showHostControls && matches.length > 0 && (
        // Host counterpart to "generate": wipe the slate (re-enables generation).
        // Destructive — confirms first because it also deletes recorded scores.
        <form
          action={clearScheduleFromForm.bind(null, eventId, divisionId, returnPath)}
          className="pt-2"
        >
          <ConfirmSubmitButton
            label="Clear schedule"
            pendingLabel="Clearing…"
            confirmTitle="Clear the entire schedule?"
            confirmMessage="This deletes every match in this division, including any recorded scores. This cannot be undone."
            confirmLabel="Clear schedule"
            destructive
          />
        </form>
      )}
    </>
  );
}
