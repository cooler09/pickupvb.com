import {
  ConflictError,
  Group,
  GroupId,
  UserId,
  type GroupRepository,
  type GroupRole,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

const GROUP_COLUMNS = 'id, slug, name, description, home_city, region, avatar_url, created_by';

type GroupRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  home_city: string | null;
  region: string | null;
  avatar_url: string | null;
  created_by: string | null;
};

type MemberRow = { user_id: string; role: string };

/**
 * Supabase adapter for the `Group` write aggregate (ADR 0021).
 *
 * Like `SupabaseUserRepository`, it **requires** a client: group writes run
 * under the caller's session so RLS (`created_by = auth.uid()` on insert,
 * owner/admin on update) is the real authorization gate — the caller passes
 * its own user-scoped client rather than the service-role admin client.
 *
 * `add`/`save` persist exactly the profile columns the aggregate models today
 * (ADR 0021's incremental migration); membership, follows, `hero_image_url`,
 * and `deleted_at` are still written by their own actions and left untouched.
 */
export class SupabaseGroupRepository implements GroupRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: GroupId): Promise<Group | null> {
    const [groupRes, memberRes] = await Promise.all([
      this.client
        .from('groups')
        .select(GROUP_COLUMNS)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle(),
      this.client.from('group_members').select('user_id, role').eq('group_id', id),
    ]);
    if (groupRes.error) throw new Error(`Group.findById failed: ${groupRes.error.message}`);
    if (!groupRes.data) return null;
    if (memberRes.error) {
      throw new Error(`Group.findById members failed: ${memberRes.error.message}`);
    }
    const row = groupRes.data as unknown as GroupRow;
    const members = ((memberRes.data as MemberRow[] | null) ?? []).map((m) => ({
      userId: UserId(m.user_id),
      role: m.role as GroupRole,
    }));
    return Group.fromPersistence({
      id: GroupId(row.id),
      slug: row.slug,
      name: row.name,
      description: row.description ?? '',
      homeCity: row.home_city,
      region: row.region,
      avatarUrl: row.avatar_url,
      createdBy: UserId(row.created_by ?? ''),
      members,
    });
  }

  async add(group: Group): Promise<void> {
    const { error } = await this.client.from('groups').insert({
      id: group.id,
      slug: group.slug,
      name: group.name,
      description: group.description,
      home_city: group.homeCity,
      region: group.region,
      avatar_url: group.avatarUrl,
      created_by: group.createdBy,
    } as never);

    if (error) {
      // 23505 = unique_violation on the slug.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('That slug is taken — pick another.', { slug: group.slug });
      }
      throw new Error(`Group.add failed: ${error.message}`);
    }
  }

  async save(group: Group): Promise<void> {
    const { error } = await this.client
      .from('groups')
      .update({
        name: group.name,
        description: group.description,
        home_city: group.homeCity,
        region: group.region,
        avatar_url: group.avatarUrl,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', group.id);

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('That slug is taken — pick another.', { slug: group.slug });
      }
      throw new Error(`Group.save failed: ${error.message}`);
    }
  }

  async saveMembers(group: Group): Promise<void> {
    const diff = group.memberDiff();

    for (const m of diff.added) {
      const { error } = await this.client
        .from('group_members')
        .insert({ group_id: group.id, user_id: m.userId, role: m.role } as never);
      if (error) throw new Error(`Group.saveMembers insert failed: ${error.message}`);
    }
    for (const m of diff.roleChanged) {
      const { error } = await this.client
        .from('group_members')
        .update({ role: m.role } as never)
        .eq('group_id', group.id)
        .eq('user_id', m.userId);
      if (error) throw new Error(`Group.saveMembers role update failed: ${error.message}`);
    }
    for (const userId of diff.removed) {
      const { error } = await this.client
        .from('group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', userId);
      if (error) throw new Error(`Group.saveMembers delete failed: ${error.message}`);
    }
  }
}
