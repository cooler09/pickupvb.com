import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@pickupvb/supabase';
import { SupabaseGroupQueryRepository } from '@pickupvb/infrastructure';
import { GroupCard, type GroupCardData } from '@/app/groups/_components/group-card';
import { TeamCard, type TeamCardData } from '@/app/teams/_components/team-card';

export type PlaysWithData = {
  groups: GroupCardData[];
  teams: TeamCardData[];
};

/**
 * Loads the public "community context" for a player's profile — the groups
 * they belong to and the teams they're rostered on — for the `/players/[id]`
 * page. Runs under the sessionless anon client (the page is ISR-cached), which
 * is safe because `group_members` / `groups` / `team_members` / `teams` all
 * select under RLS `using (true)`. Read-only; renders nothing if the player
 * has no public memberships (PUB-7 — give the non-host profile substance).
 */
export async function loadPlaysWith(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PlaysWithData> {
  const [memberships, teamRes] = await Promise.all([
    new SupabaseGroupQueryRepository(supabase).listMembershipsForUser(userId),
    supabase
      .from('team_members')
      .select('status, teams:teams!inner(id, slug, name, captain_id, deleted_at)')
      .eq('user_id', userId),
  ]);

  const groups: GroupCardData[] = memberships.map((m) => ({
    slug: m.group.slug,
    name: m.group.name,
    avatarUrl: m.group.avatarUrl,
    homeCity: m.group.homeCity,
    region: m.group.region,
  }));

  type TeamRow = {
    status: 'active' | 'pending' | null;
    teams: (TeamCardData & { deleted_at: string | null }) | null;
  };
  const teams: TeamCardData[] = ((teamRes.data as TeamRow[] | null) ?? [])
    .filter(
      (r): r is TeamRow & { teams: NonNullable<TeamRow['teams']> } =>
        !!r.teams && r.teams.deleted_at === null && (r.status ?? 'active') === 'active',
    )
    .map((r) => ({
      id: r.teams.id,
      slug: r.teams.slug,
      name: r.teams.name,
      captain_id: r.teams.captain_id,
    }));

  return { groups, teams };
}

/**
 * Presentational "Groups" + "Teams" sections for the public profile. Each is
 * gated on its own length and uses the page's flat section rhythm (matching the
 * Hosting / Videos / Past-events sections). Renders nothing when the player has
 * neither, so an idle profile doesn't sprout empty blocks.
 */
export function PlaysWith({ groups, teams }: PlaysWithData) {
  if (groups.length === 0 && teams.length === 0) return null;
  return (
    <>
      {groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-fg text-lg font-semibold">
            Groups <span className="text-muted text-sm font-normal">({groups.length})</span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <GroupCard key={g.slug} group={g} />
            ))}
          </ul>
        </section>
      )}
      {teams.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-fg text-lg font-semibold">
            Teams <span className="text-muted text-sm font-normal">({teams.length})</span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {teams.map((t) => (
              <TeamCard key={t.id} team={t} role="public" />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
