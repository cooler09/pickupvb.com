import {
  emptyPlayerBadgeStats,
  type BadgeGrantInput,
  type BadgeRepository,
  type BadgeSource,
  type GrantedBadge,
  type PlayerBadgeStats,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';
import { asJson } from './supabase-json.js';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

const UNIQUE_VIOLATION = '23505';

type BadgeRow = {
  user_id: string;
  badge_key: string;
  source: string;
  awarded_at: string;
  context: Record<string, unknown> | null;
  hidden: boolean;
};

type StatsRow = {
  published_event_count: number;
  attended_event_count: number;
  distinct_positions_played: number;
  tournament_championships: number;
  tournament_podiums: number;
  leagues_completed: number;
  max_events_with_single_host: number;
};

function rowToGranted(row: BadgeRow): GrantedBadge {
  return {
    userId: row.user_id,
    badgeKey: row.badge_key,
    source: row.source as BadgeSource,
    awardedAt: new Date(row.awarded_at),
    context: row.context,
    hidden: row.hidden,
  };
}

/**
 * Badge subsystem adapter (gamification Phase 1).
 *
 * Built on the **service-role** client: grants are system-awarded (the
 * reconcile use-case decides them off the catalog rules, the user never
 * authors them) and `loadStats` reads facts across several tables via the
 * `compute_player_badge_stats` SECURITY DEFINER RPC. This is the session-less /
 * system-write case where the admin client is the sanctioned path
 * (AGENTS.md pitfall #8) — there is no per-user authorization to delegate to
 * RLS here. Other users' badges are read by the web layer through the
 * `user_badges_public` view, not this adapter.
 */
export class SupabaseBadgeRepository implements BadgeRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** Idempotent insert: a duplicate (already-held) grant resolves to `false`. */
  async grant(input: BadgeGrantInput): Promise<boolean> {
    const { data, error } = await this.client
      .from('user_badges')
      .insert({
        user_id: input.userId,
        badge_key: input.badgeKey,
        source: input.source,
        context: asJson(input.context ?? null),
      })
      .select('badge_key')
      .maybeSingle();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return false; // already granted — no-op
      throw new Error(`Badge.grant failed: ${error.message}`);
    }
    return data != null;
  }

  async listForUser(userId: string): Promise<GrantedBadge[]> {
    const { data, error } = await this.client
      .from('user_badges')
      .select('user_id, badge_key, source, awarded_at, context, hidden')
      .eq('user_id', userId)
      .order('awarded_at', { ascending: true });
    if (error) throw new Error(`Badge.listForUser failed: ${error.message}`);
    return ((data as BadgeRow[] | null) ?? []).map(rowToGranted);
  }

  async loadStats(userId: string): Promise<PlayerBadgeStats> {
    const { data, error } = await this.client.rpc('compute_player_badge_stats', {
      p_user_id: userId,
    });
    if (error) throw new Error(`Badge.loadStats failed: ${error.message}`);
    // The RPC returns a single-row set (SETOF). Default to the empty snapshot
    // for a brand-new account with no rows to aggregate.
    const row = ((data as StatsRow[] | null) ?? [])[0];
    if (!row) return emptyPlayerBadgeStats();
    return {
      publishedEventCount: row.published_event_count,
      attendedEventCount: row.attended_event_count,
      distinctPositionsPlayed: row.distinct_positions_played,
      tournamentChampionships: row.tournament_championships,
      tournamentPodiums: row.tournament_podiums,
      leaguesCompleted: row.leagues_completed,
      maxEventsWithSingleHost: row.max_events_with_single_host,
    };
  }
}
