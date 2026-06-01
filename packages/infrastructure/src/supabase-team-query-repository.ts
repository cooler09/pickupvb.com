import {
  playersPerSide,
  type Format,
  type TeamDirectoryCard,
  type TeamDirectoryPage,
  type TeamDirectoryQuery,
  type TeamQueries,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';
import { SupabaseProfileRepository, escapeLike } from './supabase-profile-repository.js';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type TeamRow = {
  id: string;
  slug: string;
  name: string;
  format: string;
  captain_id: string;
  extra_member_count: number | null;
};

/**
 * Supabase adapter for the teams read side (`TeamQueries`) — the `/teams`
 * discover directory. Like the profile/group query repositories it **requires**
 * a client (runs under the anon directory page's context or the viewer's
 * session) and reuses the shared `escapeLike` guard.
 *
 * `searchDirectory` resolves captain display names through `ProfileQueries`
 * (adapter-composes-adapter, since `profiles_public` has no FK to join) and
 * projects each team's active roster size (TM-1).
 */
export class SupabaseTeamQueryRepository implements TeamQueries {
  constructor(private readonly client: SupabaseClient) {}

  async searchDirectory({
    nameLike,
    format,
    limit,
    offset,
  }: TeamDirectoryQuery): Promise<TeamDirectoryPage> {
    let query = this.client
      .from('teams')
      .select('id, slug, name, format, captain_id, extra_member_count', { count: 'exact' })
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);
    if (nameLike) query = query.ilike('name', `%${escapeLike(nameLike)}%`);
    if (format) query = query.eq('format', format as Format);
    const { data, count, error } = await query;
    if (error) throw new Error(`searchDirectory failed: ${error.message}`);
    const rows = (data as TeamRow[] | null) ?? [];

    const captainIds = [...new Set(rows.map((r) => r.captain_id).filter(Boolean))];
    const [rosterCounts, captains] = await Promise.all([
      this.countActiveMembers(rows.map((r) => r.id)),
      new SupabaseProfileRepository(this.client).findCardsByIds(captainIds),
    ]);

    const cards: TeamDirectoryCard[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      format: r.format,
      captainId: r.captain_id,
      captainName: captains.get(r.captain_id)?.displayName ?? null,
      rosterCount: (rosterCounts.get(r.id) ?? 0) + (r.extra_member_count ?? 0),
      teamSize: playersPerSide(r.format as Format),
    }));
    return { cards, total: count ?? cards.length };
  }

  /**
   * Active roster sizes for a set of team ids — the directory's "recruiting vs
   * full" signal. `team_members` is publicly selectable (RLS `using (true)`),
   * so this works on the sessionless anon client. Cosmetic — on error we return
   * an empty map and cards fall back to a 0 count rather than failing the page.
   */
  private async countActiveMembers(ids: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const { data, error } = await this.client
      .from('team_members')
      .select('team_id')
      .in('team_id', ids)
      .eq('status', 'active');
    if (error) return out;
    for (const r of (data as { team_id: string }[] | null) ?? []) {
      out.set(r.team_id, (out.get(r.team_id) ?? 0) + 1);
    }
    return out;
  }
}
