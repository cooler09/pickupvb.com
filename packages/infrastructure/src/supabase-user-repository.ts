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
  'auto_accept_team_invites, show_pro_badge, ' +
  'theme_preference, hero_image_url, business_name, business_address, tax_id';

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
  theme_preference: string | null;
  hero_image_url: string | null;
  business_name: string | null;
  business_address: string | null;
  tax_id: string | null;
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
      themePreference: row.theme_preference ?? 'light',
      heroImageUrl: row.hero_image_url,
      businessInfo: {
        businessName: row.business_name,
        businessAddress: row.business_address,
        taxId: row.tax_id,
      },
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
        theme_preference: user.themePreference,
        hero_image_url: user.heroImageUrl,
        business_name: user.businessInfo.businessName,
        business_address: user.businessInfo.businessAddress,
        tax_id: user.businessInfo.taxId,
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

  async addFriendEdge(viewerId: UserId, friendId: UserId): Promise<void> {
    // Idempotent: re-following an existing edge must not error. The edge table
    // is keyed on (user_id, friend_id), so ignore the duplicate on conflict.
    const { error } = await this.client
      .from('friendships')
      .upsert({ user_id: viewerId, friend_id: friendId } as never, {
        onConflict: 'user_id,friend_id',
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`addFriendEdge failed: ${error.message}`);
  }

  async removeFriendEdge(viewerId: UserId, friendId: UserId): Promise<void> {
    const { error } = await this.client
      .from('friendships')
      .delete()
      .eq('user_id', viewerId)
      .eq('friend_id', friendId);
    if (error) throw new Error(`removeFriendEdge failed: ${error.message}`);
  }
}
