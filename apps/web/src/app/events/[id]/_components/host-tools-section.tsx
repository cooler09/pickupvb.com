import { HostBroadcastPanel } from './host-broadcast-panel';
import { HostDivisionsManager } from './host-divisions-manager';
import { HostAdHocTeamsPanel, type HostAdHocTeamRow } from './host-ad-hoc-teams-panel';
import { HostDivisionWinnersPanel } from './host-division-winners-panel';
import { LeagueTeamsPanel } from './league-teams-panel';
import type { EventDetailReadModel } from '@pickupvb/domain';
import type { EligibleTeamOption, LeagueTeamView } from '../_loaders/load-event-detail';

export function HostToolsSection({
  event,
  returnPath,
  adHocHostRows,
  eligibleTeamsByDivision,
  leagueTeamsByDivision,
}: {
  event: EventDetailReadModel;
  returnPath: string;
  adHocHostRows: ReadonlyArray<HostAdHocTeamRow>;
  eligibleTeamsByDivision: ReadonlyMap<string, EligibleTeamOption[]>;
  leagueTeamsByDivision: ReadonlyMap<string, LeagueTeamView[]>;
}) {
  if (!event.canManage) return null;
  return (
    <details className="border-border-base group rounded-lg border p-3 open:p-4">
      <summary className="text-fg cursor-pointer text-sm font-semibold select-none">
        Host tools
      </summary>
      <div className="mt-4 space-y-6">
        <HostDivisionsManager
          eventId={event.id}
          returnPath={returnPath}
          divisions={event.divisions}
        />
        <HostBroadcastPanel
          eventId={event.id}
          attendeeCount={event.attendees.filter((a) => !a.waitlist).length}
        />
        {event.type === 'tournament' &&
          event.divisions.some((d) => d.teamRegistrationMode === 'ad_hoc') && (
            <HostAdHocTeamsPanel
              eventId={event.id}
              returnPath={returnPath}
              divisions={event.divisions.map((d) => ({
                id: d.id,
                label: d.label,
                isAdHoc: d.teamRegistrationMode === 'ad_hoc',
              }))}
              rows={adHocHostRows}
            />
          )}
        {event.type === 'tournament' && event.divisions.length > 0 && (
          <HostDivisionWinnersPanel
            eventId={event.id}
            returnPath={returnPath}
            divisions={event.divisions}
            eligibleTeamsByDivision={eligibleTeamsByDivision}
          />
        )}
        {event.type === 'league' && event.divisions.length > 0 && (
          <LeagueTeamsPanel
            eventId={event.id}
            returnPath={returnPath}
            divisions={event.divisions}
            teamsByDivision={leagueTeamsByDivision}
          />
        )}
      </div>
    </details>
  );
}
