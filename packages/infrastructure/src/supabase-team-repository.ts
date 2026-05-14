import {
    Format,
    NotFoundError,
    Team,
    type TeamId,
    type TeamRepository,
    type UserId,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type TeamRow = {
    id: string;
    captain_id: string;
    name: string;
    format: Format;
};

type MemberRow = { user_id: string };

/**
 * Adapter for the `Team` aggregate. Persists to `teams` + `team_members`.
 * Roster reconciliation mirrors the event-attendees pattern: clear-and-insert
 * since the on-court counts are tiny (<= ~14 even for sixes + subs).
 */
export class SupabaseTeamRepository implements TeamRepository {
    private _client: SupabaseClient | null = null;

    private get client(): SupabaseClient {
        if (!this._client) this._client = createSupabaseAdminClient();
        return this._client;
    }

    async findById(id: TeamId): Promise<Team | null> {
        const { data, error } = await this.client
            .from('teams')
            .select('id, captain_id, name, format')
            .eq('id', String(id))
            .maybeSingle();
        if (error) throw new Error(`Team.findById(${id}) failed: ${error.message}`);
        if (!data) return null;
        const row = data as TeamRow;

        const { data: memberRows, error: mErr } = await this.client
            .from('team_members')
            .select('user_id')
            .eq('team_id', row.id);
        if (mErr) throw new Error(`Team.findById members failed: ${mErr.message}`);

        const team = Team.create({
            id: row.id as never as TeamId,
            captainId: row.captain_id as UserId,
            name: row.name,
            format: row.format,
        });
        // Replay roster (Team.create seeds the captain; add the rest).
        for (const m of (memberRows as MemberRow[] | null) ?? []) {
            if (m.user_id !== row.captain_id) {
                team.addMember(m.user_id as UserId);
            }
        }
        return team;
    }

    async save(team: Team): Promise<void> {
        const row = {
            id: String(team.id),
            captain_id: String(team.captainId),
            name: team.name,
            format: team.format,
        };
        const { error } = await this.client
            .from('teams')
            .upsert(row as never, { onConflict: 'id' });
        if (error) throw new Error(`Team.save(${team.id}) failed: ${error.message}`);

        // Reconcile roster.
        const userIds = Array.from(team.members).map((u) => String(u));
        const { error: delErr } = await this.client
            .from('team_members')
            .delete()
            .eq('team_id', String(team.id));
        if (delErr) throw new Error(`Team.save members clear failed: ${delErr.message}`);
        if (userIds.length > 0) {
            const { error: insErr } = await this.client
                .from('team_members')
                .insert(
                    userIds.map((user_id) => ({ team_id: String(team.id), user_id })) as never,
                );
            if (insErr) throw new Error(`Team.save members insert failed: ${insErr.message}`);
        }
    }
}

/**
 * Convenience used by adapters that need to refuse work when the team is
 * absent (call sites usually want a typed `NotFoundError` rather than null).
 */
export async function loadTeamOrThrow(repo: TeamRepository, id: string): Promise<Team> {
    const team = await repo.findById(id as never as TeamId);
    if (!team) throw new NotFoundError('team', id);
    return team;
}
