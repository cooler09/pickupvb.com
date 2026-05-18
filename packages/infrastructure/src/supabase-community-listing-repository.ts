import {
  CommunityListing,
  ConflictError,
  ExternalUrl,
  type CommunityListingDetailReadModel,
  type CommunityListingRepository,
  type CommunityListingSearchQuery,
  type CommunityListingStatus,
  type CommunityListingSummary,
  type Format,
  type ListingLocation,
  type SkillLevel,
  type Surface,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type ListingRow = {
  id: string;
  slug: string;
  short_code: string;
  submitter_user_id: string;
  title: string;
  description: string;
  external_url: string;
  external_host_name: string | null;
  starts_at: string;
  ends_at: string | null;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  surface: Surface | null;
  format: Format | null;
  skill_level: SkillLevel | null;
  status: CommunityListingStatus;
  report_count: number;
  claimed_event_id: string | null;
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToLocation(row: ListingRow): ListingLocation | null {
  if (
    row.city === null ||
    row.country === null ||
    row.latitude === null ||
    row.longitude === null
  ) {
    return null;
  }
  return {
    addressLine: row.address_line,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function rowToAggregate(row: ListingRow): CommunityListing {
  return CommunityListing.fromPersistence({
    id: row.id as never,
    submitterUserId: row.submitter_user_id as never,
    title: row.title,
    description: row.description,
    externalUrl: ExternalUrl.fromPersistence(row.external_url),
    externalHostName: row.external_host_name,
    startsAt: new Date(row.starts_at),
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    location: rowToLocation(row),
    surface: row.surface,
    format: row.format,
    skillLevel: row.skill_level,
    status: row.status,
    reportCount: row.report_count,
    claimedEventId: row.claimed_event_id as never,
    claimedByUserId: row.claimed_by_user_id as never,
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
  });
}

export class SupabaseCommunityListingRepository implements CommunityListingRepository {
  private _client: SupabaseClient | null = null;

  private get client(): SupabaseClient {
    if (!this._client) this._client = createSupabaseAdminClient();
    return this._client;
  }

  // Untyped accessor for tables not yet in the generated Database types.
  // After `pnpm --filter @pickupvb/supabase gen:types`, these `as never` casts
  // can be removed.
  private table(name: string): ReturnType<SupabaseClient['from']> {
    return (
      this.client as unknown as { from: (n: string) => ReturnType<SupabaseClient['from']> }
    ).from(name);
  }

  async findById(id: string): Promise<CommunityListing | null> {
    const { data, error } = await this.table('community_listings')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`CommunityListing.findById(${id}) failed: ${error.message}`);
    if (!data) return null;
    return rowToAggregate(data as unknown as ListingRow);
  }

  async findBySlug(slug: string): Promise<CommunityListing | null> {
    const { data, error } = await this.table('community_listings')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(`CommunityListing.findBySlug(${slug}) failed: ${error.message}`);
    if (!data) return null;
    return rowToAggregate(data as unknown as ListingRow);
  }

  async save(listing: CommunityListing): Promise<void> {
    const loc = listing.location;
    const wkt = loc ? `SRID=4326;POINT(${loc.longitude} ${loc.latitude})` : null;

    const row = {
      id: String(listing.id),
      submitter_user_id: String(listing.submitterUserId),
      title: listing.title,
      description: listing.description,
      external_url: listing.externalUrl.toString(),
      external_host_name: listing.externalHostName,
      starts_at: listing.startsAt.toISOString(),
      ends_at: listing.endsAt ? listing.endsAt.toISOString() : null,
      address_line: loc?.addressLine ?? null,
      city: loc?.city ?? null,
      region: loc?.region ?? null,
      postal_code: loc?.postalCode ?? null,
      country: loc?.country ?? null,
      geo: wkt,
      surface: listing.surface,
      format: listing.format,
      skill_level: listing.skillLevel,
      status: listing.status,
      claimed_event_id: listing.claimedEventId ? String(listing.claimedEventId) : null,
      claimed_by_user_id: listing.claimedByUserId ? String(listing.claimedByUserId) : null,
      claimed_at: listing.claimedAt ? listing.claimedAt.toISOString() : null,
    };

    const { error } = await this.table('community_listings').upsert(row as never, {
      onConflict: 'id',
    });
    if (error) throw new Error(`CommunityListing.save(${listing.id}) failed: ${error.message}`);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.table('community_listings').delete().eq('id', id);
    if (error) throw new Error(`CommunityListing.delete(${id}) failed: ${error.message}`);
  }

  async countByUserSince(userId: string, since: Date): Promise<number> {
    const { count, error } = await (
      this.table('community_listings').select('id', { count: 'exact', head: true }) as ReturnType<
        ReturnType<SupabaseClient['from']>['select']
      >
    )
      .eq('submitter_user_id', userId)
      .gte('created_at', since.toISOString());
    if (error) throw new Error(`CommunityListing.countByUserSince failed: ${error.message}`);
    return count ?? 0;
  }

  async recordReport(
    listingId: string,
    reporterUserId: string,
    reason: string | null,
  ): Promise<void> {
    const { error } = await this.table('community_listing_reports').insert({
      listing_id: listingId,
      reporter_user_id: reporterUserId,
      reason,
    } as never);
    if (error) {
      // 23505 = unique_violation (one report per user per listing).
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('You have already reported this listing.', {
          listingId,
          reporterUserId,
        });
      }
      throw new Error(`CommunityListing.recordReport failed: ${error.message}`);
    }
  }

  async search(query: CommunityListingSearchQuery): Promise<CommunityListingSummary[]> {
    const statuses = query.statuses ?? ['active'];
    const limit = query.limit ?? 20;

    // If a geo radius is requested, defer to the PostGIS RPC so distance
    // ordering and bounding happen in the database. Otherwise use the plain
    // table query (cheaper, no PostGIS call).
    if (query.near) {
      const rpcClient = this.client as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      const { data, error } = await rpcClient.rpc('search_community_listings', {
        p_lat: query.near.latitude,
        p_lng: query.near.longitude,
        p_radius_km: query.near.radiusKm,
        p_surface: query.surface ?? null,
        p_format: query.format ?? null,
        p_skill_level: query.skillLevel ?? null,
        p_starts_after: query.startsAfter ? query.startsAfter.toISOString() : null,
        p_starts_before: query.startsBefore ? query.startsBefore.toISOString() : null,
        p_statuses: statuses,
        p_limit: limit,
      });
      if (error) throw new Error(`CommunityListing.search (rpc) failed: ${error.message}`);
      type RpcRow = {
        id: string;
        slug: string;
        short_code: string;
        title: string;
        external_url: string;
        external_host_name: string | null;
        starts_at: string;
        ends_at: string | null;
        city: string | null;
        region: string | null;
        surface: string | null;
        format: string | null;
        skill_level: string | null;
        status: string;
        distance_km: number | null;
      };
      const rows = (data ?? []) as RpcRow[];
      return rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        shortCode: r.short_code,
        title: r.title,
        externalUrl: r.external_url,
        externalHostName: r.external_host_name,
        startsAt: new Date(r.starts_at),
        endsAt: r.ends_at ? new Date(r.ends_at) : null,
        city: r.city,
        region: r.region,
        surface: r.surface as CommunityListingSummary['surface'],
        format: r.format as CommunityListingSummary['format'],
        skillLevel: r.skill_level as CommunityListingSummary['skillLevel'],
        status: r.status as CommunityListingSummary['status'],
        distanceKm: r.distance_km,
      }));
    }

    let q = this.table('community_listings')
      .select(
        'id, slug, short_code, title, external_url, external_host_name, starts_at, ends_at, city, region, surface, format, skill_level, status',
      )
      .in('status', statuses as unknown as string[]);
    if (query.surface) q = q.eq('surface', query.surface);
    if (query.format) q = q.eq('format', query.format);
    if (query.skillLevel) q = q.eq('skill_level', query.skillLevel);
    if (query.startsAfter) q = q.gte('starts_at', query.startsAfter.toISOString());
    if (query.startsBefore) q = q.lte('starts_at', query.startsBefore.toISOString());
    q = q.order('starts_at', { ascending: true }).limit(limit);

    const { data, error } = await q;
    if (error) throw new Error(`CommunityListing.search failed: ${error.message}`);

    type SearchRow = Pick<
      ListingRow,
      | 'id'
      | 'slug'
      | 'short_code'
      | 'title'
      | 'external_url'
      | 'external_host_name'
      | 'starts_at'
      | 'ends_at'
      | 'city'
      | 'region'
      | 'surface'
      | 'format'
      | 'skill_level'
      | 'status'
    >;
    const rows = (data ?? []) as unknown as SearchRow[];
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      shortCode: r.short_code,
      title: r.title,
      externalUrl: r.external_url,
      externalHostName: r.external_host_name,
      startsAt: new Date(r.starts_at),
      endsAt: r.ends_at ? new Date(r.ends_at) : null,
      city: r.city,
      region: r.region,
      surface: r.surface,
      format: r.format,
      skillLevel: r.skill_level,
      status: r.status,
      distanceKm: null,
    }));
  }

  async getDetail(
    idOrSlug: string,
    viewerId: string | null,
  ): Promise<CommunityListingDetailReadModel | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const { data, error } = await this.table('community_listings')
      .select('*')
      .eq(isUuid ? 'id' : 'slug', idOrSlug)
      .maybeSingle();
    if (error) throw new Error(`CommunityListing.getDetail(${idOrSlug}) failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as ListingRow;

    const [submitterRes, viewerProfileRes, reportRes] = await Promise.all([
      this.client
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', row.submitter_user_id)
        .maybeSingle(),
      viewerId
        ? (this.client as unknown as { from: (n: string) => ReturnType<SupabaseClient['from']> })
            .from('profiles')
            .select('is_platform_admin')
            .eq('id', viewerId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      viewerId
        ? this.table('community_listing_reports')
            .select('id', { head: true, count: 'exact' })
            .eq('listing_id', row.id)
            .eq('reporter_user_id', viewerId)
        : Promise.resolve({ count: 0, error: null }),
    ]);

    if (submitterRes.error) {
      throw new Error(
        `CommunityListing.getDetail submitter lookup failed: ${submitterRes.error.message}`,
      );
    }
    const submitter = (submitterRes.data ?? null) as {
      id: string;
      display_name: string;
      avatar_url: string | null;
    } | null;
    const isPlatformAdmin =
      !!viewerId &&
      !!(viewerProfileRes.data as { is_platform_admin?: boolean } | null)?.is_platform_admin;
    const hasReported = !!viewerId && ((reportRes as { count: number | null }).count ?? 0) > 0;
    const canManage = !!viewerId && (viewerId === row.submitter_user_id || isPlatformAdmin);

    return {
      id: row.id,
      slug: row.slug,
      shortCode: row.short_code,
      title: row.title,
      description: row.description,
      externalUrl: row.external_url,
      externalHostName: row.external_host_name,
      startsAt: new Date(row.starts_at),
      endsAt: row.ends_at ? new Date(row.ends_at) : null,
      location: rowToLocation(row),
      surface: row.surface,
      format: row.format,
      skillLevel: row.skill_level,
      status: row.status,
      reportCount: row.report_count,
      submitter: {
        id: submitter?.id ?? row.submitter_user_id,
        displayName: submitter?.display_name ?? 'Unknown',
        avatarUrl: submitter?.avatar_url ?? null,
      },
      claimedEventId: row.claimed_event_id,
      claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
      createdAt: new Date(row.created_at),
      canManage,
      isPlatformAdmin,
      hasReported,
    };
  }

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const { data, error } = await (
      this.client as unknown as { from: (n: string) => ReturnType<SupabaseClient['from']> }
    )
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new Error(`isPlatformAdmin(${userId}) failed: ${error.message}`);
    return !!(data as { is_platform_admin?: boolean } | null)?.is_platform_admin;
  }
}
