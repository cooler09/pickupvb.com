import type {
  GroupCard,
  GroupDetail,
  GroupDirectoryPage,
  GroupDirectoryQuery,
  GroupMemberCard,
  GroupMembership,
  GroupQueries,
  GroupRole,
  GroupSlugEntry,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';
import { SupabaseProfileRepository, escapeLike } from './supabase-profile-repository.js';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

const CARD_COLUMNS = 'id, slug, name, description, avatar_url, home_city, region';
const DETAIL_COLUMNS = `${CARD_COLUMNS}, hero_image_url, created_by`;
// Embedded card via the single-valued group_members → groups FK.
const MEMBERSHIP_COLUMNS = `role, groups:groups!inner(${CARD_COLUMNS})`;

type MembershipRow = { role: string; groups: CardRow | null };

type CardRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  home_city: string | null;
  region: string | null;
};

type DetailRow = CardRow & {
  hero_image_url: string | null;
  created_by: string | null;
};

function toCard(row: CardRow): GroupCard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    avatarUrl: row.avatar_url,
    homeCity: row.home_city,
    region: row.region,
  };
}

function toDetail(row: DetailRow): GroupDetail {
  return {
    ...toCard(row),
    heroImageUrl: row.hero_image_url,
    createdBy: row.created_by,
  };
}

/**
 * Supabase adapter for the groups read side (ADR 0021 — `GroupQueries`).
 *
 * Like `SupabaseProfileRepository`, it **requires** a client: group reads run
 * under whatever auth context the call site has (anon directory page, the
 * viewer's session, …). Reads filter `deleted_at is null` explicitly (defensive
 * — RLS already does, but the filter keeps the adapter correct under any client)
 * and reuse the shared `escapeLike` guard so search terms are matched literally.
 */
export class SupabaseGroupQueryRepository implements GroupQueries {
  constructor(private readonly client: SupabaseClient) {}

  async searchDirectory({
    search,
    limit,
    offset,
  }: GroupDirectoryQuery): Promise<GroupDirectoryPage> {
    let query = this.client
      .from('groups')
      .select(CARD_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);
    if (search) {
      const esc = escapeLike(search);
      query = query.or(`name.ilike.%${esc}%,slug.ilike.%${esc}%,home_city.ilike.%${esc}%`);
    }
    const { data, count, error } = await query;
    if (error) throw new Error(`searchDirectory failed: ${error.message}`);
    const cards = ((data as CardRow[] | null) ?? []).map(toCard);
    return { cards, total: count ?? cards.length };
  }

  async listCards(limit: number): Promise<GroupCard[]> {
    const { data, error } = await this.client
      .from('groups')
      .select(CARD_COLUMNS)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(limit);
    if (error) throw new Error(`listCards failed: ${error.message}`);
    return ((data as CardRow[] | null) ?? []).map(toCard);
  }

  async findDetailBySlug(slug: string): Promise<GroupDetail | null> {
    const { data, error } = await this.client
      .from('groups')
      .select(DETAIL_COLUMNS)
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`findDetailBySlug failed: ${error.message}`);
    return data ? toDetail(data as unknown as DetailRow) : null;
  }

  async listMembers(groupId: string): Promise<GroupMemberCard[]> {
    const { data, error } = await this.client
      .from('group_members')
      .select('user_id, role')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });
    if (error) throw new Error(`listMembers failed: ${error.message}`);
    const rows = (data as { user_id: string; role: string }[] | null) ?? [];
    // Compose the profile read adapter on the same client (adapter-composes-
    // adapter): the roster owns the edge, profile cards stay owned by
    // ProfileQueries. `profiles_public` has no FK to join, so resolve in JS.
    const cards = await new SupabaseProfileRepository(this.client).findCardsByIds(
      rows.map((r) => r.user_id),
    );
    return rows.map((r) => ({
      userId: r.user_id,
      role: r.role as GroupRole,
      profile: cards.get(r.user_id) ?? null,
    }));
  }

  async findViewerRole(groupId: string, userId: string): Promise<GroupRole | null> {
    const { data, error } = await this.client
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`findViewerRole failed: ${error.message}`);
    return ((data as { role: string } | null)?.role as GroupRole | undefined) ?? null;
  }

  async listMembershipsForUser(userId: string): Promise<GroupMembership[]> {
    const { data, error } = await this.client
      .from('group_members')
      .select(MEMBERSHIP_COLUMNS)
      .eq('user_id', userId);
    if (error) throw new Error(`listMembershipsForUser failed: ${error.message}`);
    const rows = (data as unknown as MembershipRow[] | null) ?? [];
    return rows
      .filter((r): r is MembershipRow & { groups: CardRow } => r.groups !== null)
      .map((r) => ({ group: toCard(r.groups), role: r.role as GroupRole }));
  }

  async listManageableGroups(userId: string): Promise<GroupCard[]> {
    const { data, error } = await this.client
      .from('group_members')
      .select(MEMBERSHIP_COLUMNS)
      .eq('user_id', userId)
      .in('role', ['owner', 'admin']);
    if (error) throw new Error(`listManageableGroups failed: ${error.message}`);
    const rows = (data as unknown as MembershipRow[] | null) ?? [];
    return rows
      .map((r) => r.groups)
      .filter((g): g is CardRow => g !== null)
      .map(toCard);
  }

  async listSlugs(): Promise<GroupSlugEntry[]> {
    const { data, error } = await this.client
      .from('groups')
      .select('slug, updated_at')
      .is('deleted_at', null);
    if (error) throw new Error(`listSlugs failed: ${error.message}`);
    return ((data as { slug: string; updated_at: string | null }[] | null) ?? []).map((r) => ({
      slug: r.slug,
      updatedAt: r.updated_at,
    }));
  }
}
