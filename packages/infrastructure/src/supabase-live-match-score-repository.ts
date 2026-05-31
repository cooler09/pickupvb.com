import {
  NotFoundError,
  UnauthorizedError,
  type LiveMatchScore,
  type LiveMatchScoreRepository,
  type MatchKind,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Live (in-progress) match-score adapter — ADR 0023. Persists the
 * {@link LiveMatchScore} value object to a narrow `match_live_scores` row via
 * the authorization-gated RPCs (`upsert_match_live_score` /
 * `clear_match_live_score`), and reads the current row back.
 *
 * Like {@link SupabaseLeagueScheduleRepository}'s captain path, writes MUST run
 * through a *user-scoped* client so the RPC's host-or-captain gate is enforced
 * against `auth.uid()`. The composition root builds this per request with the
 * user-scoped client (see `getMatchResultHandlers`); the module-singleton
 * admin client would bypass the gate (AGENTS.md pitfall #8). Reads are public.
 */
export class SupabaseLiveMatchScoreRepository implements LiveMatchScoreRepository {
  private _client: SupabaseClient | null;

  constructor(client?: SupabaseClient) {
    this._client = client ?? null;
  }

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  async upsert(matchId: string, kind: MatchKind, state: LiveMatchScore): Promise<void> {
    const { error } = await this.client.rpc('upsert_match_live_score', {
      p_match_id: matchId,
      p_kind: kind,
      p_live_state: state,
    } as never);
    if (error) {
      if (error.code === '42501') {
        throw new UnauthorizedError('You can only score matches you host or captain.');
      }
      if (error.code === 'P0002') {
        throw new NotFoundError('Match', matchId);
      }
      throw new Error(`live score upsert failed: ${error.message}`);
    }
  }

  async clear(matchId: string): Promise<void> {
    const { error } = await this.client.rpc('clear_match_live_score', {
      p_match_id: matchId,
    } as never);
    if (error) {
      if (error.code === '42501') {
        throw new UnauthorizedError('You can only clear matches you host or captain.');
      }
      throw new Error(`live score clear failed: ${error.message}`);
    }
  }

  async findByMatchId(matchId: string): Promise<LiveMatchScore | null> {
    const { data, error } = await this.client
      .from('match_live_scores')
      .select('live_state')
      .eq('match_id', matchId)
      .maybeSingle();
    if (error) throw new Error(`live score load failed: ${error.message}`);
    const row = data as { live_state: unknown } | null;
    if (!row) return null;
    return row.live_state as LiveMatchScore;
  }
}
