'use client';

import { AvatarUpload } from './avatar-upload';
import { saveGroupAvatarUrl } from '@/app/groups/[id]/edit/group-avatar-actions';

type Props = {
  groupId: string;
  /** Authenticated user's id — the Storage path prefix (RLS gate). */
  userId: string;
  currentUrl: string | null;
  initials: string;
  returnPath: string;
};

/**
 * Group-edit panel for the group avatar (logo) upload. Thin wrapper that binds
 * `saveGroupAvatarUrl` as the `onSave` callback for `AvatarUpload`, keyed to a
 * group-scoped Storage path (`${userId}/groups/${groupId}/avatar.webp`). The
 * leading `${userId}/` segment satisfies the `avatars` bucket owner-path RLS;
 * the orphan-sweep walker treats the object as live via `groups.avatar_url`.
 * Square (`shape="rounded"`) to match how the group avatar renders elsewhere.
 */
export function GroupAvatarPanel({ groupId, userId, currentUrl, initials, returnPath }: Props) {
  async function handleSave(url: string | null) {
    await saveGroupAvatarUrl(groupId, url, returnPath);
  }

  return (
    <div className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Group avatar</h2>
        <p className="text-muted text-xs">
          A logo or photo shown on the group page, the directory, and rosters.
        </p>
      </div>
      <AvatarUpload
        userId={userId}
        currentUrl={currentUrl}
        initials={initials}
        onSave={handleSave}
        objectPath={`${userId}/groups/${groupId}/avatar.webp`}
        shape="rounded"
      />
    </div>
  );
}
