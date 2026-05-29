import type {
  GroupCard,
  GroupDirectoryPage,
  GroupDirectoryQuery,
  GroupQueries,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';
import { escapeLike } from './supabase-profile-repository.js';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

const CARD_COLUMNS = 'id, slug, name, description, avatar_url, home_city, region';

type CardRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  home_city: string | null;
  region: string | null;
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
}
