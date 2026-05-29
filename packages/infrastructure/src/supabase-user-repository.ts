import { ConflictError, UserId, UserProfile, type UserRepository } from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

/** Postgres `unique_violation` — the handle is already taken. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

const EDITABLE_COLUMNS =
  'id, display_name, first_name, last_name, home_city, handle, ' +
  'primary_position, secondary_position, tertiary_position, ' +
  'instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url, ' +
  'auto_accept_team_invites, show_pro_badge';

type EditableRow = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  home_city: string | null;
  handle: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  tertiary_position: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  twitter_handle: string | null;
  facebook_handle: string | null;
  youtube_handle: string | null;
  website_url: string | null;
  auto_accept_team_invites: boolean | null;
  show_pro_badge: boolean | null;
};

/**
 * Supabase adapter for the `UserProfile` write aggregate (ADR 0020).
 *
 * Writes the base `public.profiles` table (not the read-only `profiles_public`
 * view). Like `SupabaseProfileRepository`, it **requires** a client: profile
 * writes run under the caller's session so the `id = auth.uid()` RLS policy is
 * the real authorization gate, so the caller passes its own user-scoped client
 * rather than defaulting to the service-role admin client.
 *
 * `save` persists exactly the columns the aggregate models today (ADR 0020's
 * incremental migration); theme / hero / business columns are still written
 * raw by their own actions and are intentionally left untouched here.
 */
export class SupabaseUserRepository implements UserRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: UserId): Promise<UserProfile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select(EDITABLE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`UserProfile.findById failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as EditableRow;
    return UserProfile.fromPersistence({
      id: UserId(row.id),
      displayName: row.display_name ?? '',
      firstName: row.first_name,
      lastName: row.last_name,
      homeCity: row.home_city,
      handle: row.handle ?? '',
      positions: {
        primary: row.primary_position,
        secondary: row.secondary_position,
        tertiary: row.tertiary_position,
      },
      socialHandles: {
        instagram: row.instagram_handle,
        tiktok: row.tiktok_handle,
        twitter: row.twitter_handle,
        facebook: row.facebook_handle,
        youtube: row.youtube_handle,
        website: row.website_url,
      },
      autoAcceptTeamInvites: row.auto_accept_team_invites ?? false,
      showProBadge: row.show_pro_badge ?? false,
    });
  }

  async save(user: UserProfile): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({
        display_name: user.displayName,
        first_name: user.firstName,
        last_name: user.lastName,
        home_city: user.homeCity,
        handle: user.handle,
        primary_position: user.positions.primary,
        secondary_position: user.positions.secondary,
        tertiary_position: user.positions.tertiary,
        instagram_handle: user.socialHandles.instagram,
        tiktok_handle: user.socialHandles.tiktok,
        twitter_handle: user.socialHandles.twitter,
        facebook_handle: user.socialHandles.facebook,
        youtube_handle: user.socialHandles.youtube,
        website_url: user.socialHandles.website,
        auto_accept_team_invites: user.autoAcceptTeamInvites,
        show_pro_badge: user.showProBadge,
      } as never)
      .eq('id', user.id);

    if (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('That handle is already taken — try another.', {
          handle: user.handle,
        });
      }
      throw new Error(`UserProfile.save failed: ${error.message}`);
    }
  }
}
