'use client';

import { AvatarUpload } from './avatar-upload';
import { saveAvatarUrl } from '@/app/profile/avatar-actions';

type Props = {
  userId: string;
  currentUrl: string | null;
  initials: string;
  returnPath: string;
};

/**
 * Profile-page panel for avatar (profile-picture) upload. Thin wrapper that
 * binds `saveAvatarUrl` as the `onSave` callback for `AvatarUpload`.
 */
export function AvatarPanel({ userId, currentUrl, initials, returnPath }: Props) {
  async function handleSave(url: string | null) {
    await saveAvatarUrl(url, returnPath);
  }

  return (
    <div className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Profile picture</h2>
        <p className="text-muted text-xs">
          Shown next to your name on rosters, messages, and your public profile.
        </p>
      </div>
      <AvatarUpload
        userId={userId}
        currentUrl={currentUrl}
        initials={initials}
        onSave={handleSave}
      />
    </div>
  );
}
