import {
  ConflictError,
  ExternalVideoUrl,
  MediaPost,
  type AwardCategory,
  type EventAwards,
  type EventMediaReadModel,
  type EventMediaSummary,
  type MediaKind,
  type MediaPostItem,
  type MediaPostRepository,
  type MediaPostStatus,
  type VideoProvider,
  type VideoSubtype,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type MediaRow = {
  id: string;
  short_code: string | null;
  submitter_user_id: string;
  event_id: string | null;
  match_id: string | null;
  kind: MediaKind;
  provider: VideoProvider;
  external_id: string | null;
  external_subtype: VideoSubtype;
  video_url: string;
  title: string;
  description: string;
  status: MediaPostStatus;
  report_count: number;
  featured: boolean;
  live_started_at: string | null;
  live_ended_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileCard = { id: string; display_name: string; avatar_url: string | null };

function rowToAggregate(row: MediaRow): MediaPost {
  return MediaPost.fromPersistence({
    id: row.id as never,
    submitterUserId: row.submitter_user_id as never,
    eventId: (row.event_id as never) ?? null,
    matchId: row.match_id,
    kind: row.kind,
    videoUrl: ExternalVideoUrl.fromPersistence(
      row.video_url,
      row.provider,
      row.external_id,
      row.external_subtype,
    ),
    title: row.title,
    description: row.description,
    status: row.status,
    reportCount: row.report_count,
    featured: row.featured,
    liveStartedAt: row.live_started_at ? new Date(row.live_started_at) : null,
    liveEndedAt: row.live_ended_at ? new Date(row.live_ended_at) : null,
  });
}

function rowToItem(
  row: MediaRow,
  submitter: ProfileCard | null,
  item: { canManage: boolean; hasReported: boolean },
): MediaPostItem {
  return {
    id: row.id,
    shortCode: row.short_code,
    kind: row.kind,
    provider: row.provider,
    externalId: row.external_id,
    subtype: row.external_subtype,
    videoUrl: row.video_url,
    title: row.title,
    description: row.description,
    status: row.status,
    featured: row.featured,
    isLive: row.kind === 'live_stream' && row.live_ended_at === null,
    liveStartedAt: row.live_started_at ? new Date(row.live_started_at) : null,
    liveEndedAt: row.live_ended_at ? new Date(row.live_ended_at) : null,
    reportCount: row.report_count,
    createdAt: new Date(row.created_at),
    submitter: {
      id: submitter?.id ?? row.submitter_user_id,
      displayName: submitter?.display_name ?? 'Unknown',
      avatarUrl: submitter?.avatar_url ?? null,
    },
    canManage: item.canManage,
    hasReported: item.hasReported,
  };
}

export class SupabaseMediaPostRepository implements MediaPostRepository {
  private _client: SupabaseClient | null;

  /**
   * @param client Optional Supabase client. The composition root's
   *   per-request `getMediaHandlers()` passes a *user-scoped* client so the
   *   `media_posts` RLS policies (submitter / `is_event_host` / admin) and the
   *   host-gated `feature_event_stream` RPC see the real `auth.uid()`. The
   *   cached event-detail summary builds an instance with the admin client
   *   (viewer-independent, active-only counts).
   */
  constructor(client?: SupabaseClient) {
    this._client = client ?? null;
  }

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  // Untyped accessor for tables not yet in the generated Database types.
  // After `pnpm --filter @pickupvb/supabase gen:types`, these casts can be
  // tightened.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private table(name: string): any {
    return (this.client as unknown as { from: (n: string) => unknown }).from(name);
  }

  private get rpc(): (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }> {
    return (
      this.client as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc.bind(this.client);
  }

  async findById(id: string): Promise<MediaPost | null> {
    const { data, error } = await this.table('media_posts').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`MediaPost.findById(${id}) failed: ${error.message}`);
    if (!data) return null;
    return rowToAggregate(data as unknown as MediaRow);
  }

  async save(post: MediaPost): Promise<void> {
    const row = {
      id: String(post.id),
      submitter_user_id: String(post.submitterUserId),
      event_id: post.eventId ? String(post.eventId) : null,
      match_id: post.matchId,
      kind: post.kind,
      provider: post.videoUrl.provider,
      external_id: post.videoUrl.externalId,
      external_subtype: post.videoUrl.subtype,
      video_url: post.videoUrl.value,
      title: post.title,
      description: post.description,
      status: post.status,
      featured: post.featured,
      live_started_at: post.liveStartedAt ? post.liveStartedAt.toISOString() : null,
      live_ended_at: post.liveEndedAt ? post.liveEndedAt.toISOString() : null,
    };
    // `report_count`, `short_code`, `created_at`, `updated_at` are managed by
    // DB defaults/triggers — never overwrite them on upsert.
    const { error } = await this.table('media_posts').upsert(row as never, { onConflict: 'id' });
    if (error) throw new Error(`MediaPost.save(${post.id}) failed: ${error.message}`);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.table('media_posts').delete().eq('id', id);
    if (error) throw new Error(`MediaPost.delete(${id}) failed: ${error.message}`);
  }

  async countByUserSince(userId: string, since: Date): Promise<number> {
    const { count, error } = await this.table('media_posts')
      .select('id', { count: 'exact', head: true })
      .eq('submitter_user_id', userId)
      .neq('status', 'removed')
      .gte('created_at', since.toISOString());
    if (error) throw new Error(`MediaPost.countByUserSince failed: ${error.message}`);
    return count ?? 0;
  }

  async recordReport(postId: string, reporterUserId: string, reason: string | null): Promise<void> {
    const { error } = await this.table('media_post_reports').insert({
      post_id: postId,
      reporter_user_id: reporterUserId,
      reason,
    } as never);
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('You have already reported this video.', {
          postId,
          reporterUserId,
        });
      }
      throw new Error(`MediaPost.recordReport failed: ${error.message}`);
    }
  }

  async featureEventStream(eventId: string, postId: string): Promise<void> {
    const { error } = await this.rpc('feature_event_stream', {
      p_event_id: eventId,
      p_media_id: postId,
    });
    if (error) throw new Error(`MediaPost.featureEventStream failed: ${error.message}`);
  }

  async castVote(
    eventId: string,
    postId: string,
    category: AwardCategory,
    voterUserId: string,
  ): Promise<void> {
    // Upsert on the (event_id, category, voter_user_id) unique key — voting a
    // different clip moves the vote. RLS enforces voter_user_id = auth.uid().
    const { error } = await this.table('media_post_votes').upsert(
      {
        event_id: eventId,
        post_id: postId,
        category,
        voter_user_id: voterUserId,
      } as never,
      { onConflict: 'event_id,category,voter_user_id' },
    );
    if (error) throw new Error(`MediaPost.castVote failed: ${error.message}`);
  }

  async retractVote(eventId: string, category: AwardCategory, voterUserId: string): Promise<void> {
    const { error } = await this.table('media_post_votes')
      .delete()
      .eq('event_id', eventId)
      .eq('category', category)
      .eq('voter_user_id', voterUserId);
    if (error) throw new Error(`MediaPost.retractVote failed: ${error.message}`);
  }

  // ---- Read side ---------------------------------------------------------
  async listForEvent(eventId: string, viewerId: string | null): Promise<EventMediaReadModel> {
    // RLS on the user-scoped client already restricts visibility (active OR
    // submitter OR event host OR admin). We still order + group here.
    const { data, error } = await this.table('media_posts')
      .select('*')
      .eq('event_id', eventId)
      .neq('status', 'removed')
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(`MediaPost.listForEvent(${eventId}) failed: ${error.message}`);
    const rows = (data as unknown as MediaRow[] | null) ?? [];

    const [viewerIsHost, viewerIsAdmin] = await Promise.all([
      viewerId ? this.isEventHost(eventId, viewerId) : Promise.resolve(false),
      viewerId ? this.isPlatformAdmin(viewerId) : Promise.resolve(false),
    ]);
    const canManageEvent = viewerIsHost || viewerIsAdmin;

    const [items, awards] = await Promise.all([
      this.decorate(rows, viewerId, canManageEvent),
      this.loadEventAwards(eventId, viewerId),
    ]);

    return {
      liveStreams: items.filter((i) => i.kind === 'live_stream'),
      matchVideos: items.filter((i) => i.kind === 'match_video'),
      clips: items.filter((i) => i.kind === 'clip'),
      canManageEvent,
      awards,
    };
  }

  /** Per-clip vote tallies (public counts view) + the viewer's current picks. */
  private async loadEventAwards(eventId: string, viewerId: string | null): Promise<EventAwards> {
    const [countsRes, viewerRes] = await Promise.all([
      this.table('media_post_vote_counts')
        .select('post_id, category, votes')
        .eq('event_id', eventId),
      viewerId
        ? this.table('media_post_votes')
            .select('post_id, category')
            .eq('event_id', eventId)
            .eq('voter_user_id', viewerId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const counts: EventAwards['counts'] = {};
    for (const r of (countsRes.data as
      | { post_id: string; category: AwardCategory; votes: number }[]
      | null) ?? []) {
      const entry = (counts[r.post_id] ??= { best_clip: 0, biggest_fail: 0 });
      entry[r.category] = r.votes;
    }

    const viewerVotes: EventAwards['viewerVotes'] = { best_clip: null, biggest_fail: null };
    for (const r of (viewerRes.data as { post_id: string; category: AwardCategory }[] | null) ??
      []) {
      viewerVotes[r.category] = r.post_id;
    }

    return { counts, viewerVotes };
  }

  async listForProfile(userId: string, viewerId: string | null): Promise<MediaPostItem[]> {
    let q = this.table('media_posts').select('*').eq('submitter_user_id', userId);
    // Public profile shows active posts only; the owner sees their hidden ones
    // too (so they can tell when something was auto-hidden by reports).
    q = viewerId === userId ? q.neq('status', 'removed') : q.eq('status', 'active');
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw new Error(`MediaPost.listForProfile(${userId}) failed: ${error.message}`);
    const rows = (data as unknown as MediaRow[] | null) ?? [];
    const viewerIsAdmin = viewerId ? await this.isPlatformAdmin(viewerId) : false;
    return this.decorate(rows, viewerId, viewerIsAdmin);
  }

  async getEventMediaSummary(eventId: string): Promise<EventMediaSummary> {
    const { data, error } = await this.table('media_posts')
      .select(
        'id, kind, featured, live_ended_at, provider, external_id, external_subtype, video_url, title',
      )
      .eq('event_id', eventId)
      .eq('status', 'active');
    if (error)
      throw new Error(`MediaPost.getEventMediaSummary(${eventId}) failed: ${error.message}`);
    type SummaryRow = Pick<
      MediaRow,
      | 'id'
      | 'kind'
      | 'featured'
      | 'live_ended_at'
      | 'provider'
      | 'external_id'
      | 'external_subtype'
      | 'video_url'
      | 'title'
    >;
    const rows = (data as unknown as SummaryRow[] | null) ?? [];
    const liveRows = rows.filter((r) => r.kind === 'live_stream' && r.live_ended_at === null);
    const feat = liveRows.find((r) => r.featured) ?? null;
    return {
      totalCount: rows.length,
      liveCount: liveRows.length,
      featured: feat
        ? {
            id: feat.id,
            provider: feat.provider,
            externalId: feat.external_id,
            subtype: feat.external_subtype,
            videoUrl: feat.video_url,
            title: feat.title,
          }
        : null,
    };
  }

  // ---- Helpers -----------------------------------------------------------
  /** Attach submitter cards + viewer report state + canManage to rows. */
  private async decorate(
    rows: MediaRow[],
    viewerId: string | null,
    canManageEvent: boolean,
  ): Promise<MediaPostItem[]> {
    if (rows.length === 0) return [];
    const submitterIds = [...new Set(rows.map((r) => r.submitter_user_id))];
    const postIds = rows.map((r) => r.id);

    const [profilesRes, reportsRes] = await Promise.all([
      // Submitter cards come from `profiles_public`, not the base `profiles`
      // table: this repo runs on a user-scoped client and the base SELECT policy
      // is owner-only (PII audit P1 #4), so reading `profiles` directly would
      // return only the viewer's own row — every other author's name/avatar would
      // be null (and anonymous viewers would get nothing). The view is the
      // sanctioned public projection; deleted authors fall out of it → name
      // renders via the UI fallback.
      this.client
        .from('profiles_public')
        .select('id, display_name, avatar_url')
        .in('id', submitterIds),
      viewerId
        ? this.table('media_post_reports')
            .select('post_id')
            .eq('reporter_user_id', viewerId)
            .in('post_id', postIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const profiles = new Map(
      ((profilesRes.data as ProfileCard[] | null) ?? []).map((p) => [p.id, p]),
    );
    const reported = new Set(
      ((reportsRes.data as { post_id: string }[] | null) ?? []).map((r) => r.post_id),
    );

    return rows.map((row) =>
      rowToItem(row, profiles.get(row.submitter_user_id) ?? null, {
        canManage: (!!viewerId && viewerId === row.submitter_user_id) || canManageEvent,
        hasReported: reported.has(row.id),
      }),
    );
  }

  private async isPlatformAdmin(userId: string): Promise<boolean> {
    const { data } = await this.table('profiles')
      .select('is_platform_admin')
      .eq('id', userId)
      .maybeSingle();
    return !!(data as { is_platform_admin?: boolean } | null)?.is_platform_admin;
  }

  private async isEventHost(eventId: string, userId: string): Promise<boolean> {
    const { data } = await this.table('events').select('host_id').eq('id', eventId).maybeSingle();
    if ((data as { host_id?: string } | null)?.host_id === userId) return true;
    const { count } = await this.table('event_co_hosts')
      .select('event_id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('host_user_id', userId);
    return (count ?? 0) > 0;
  }
}
