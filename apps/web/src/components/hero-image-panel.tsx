'use client';

import { HeroImageUpload } from './hero-image-upload';
import { saveHeroImageUrl } from '@/app/hero-image-actions';

type EntityType = 'events' | 'groups' | 'profiles';

type Props = {
  entityType: EntityType;
  entityId: string;
  userId: string;
  currentUrl: string | null;
  returnPath: string;
};

/**
 * Edit-form panel for hero image upload. Thin wrapper that binds
 * `saveHeroImageUrl` as the `onSave` callback for `HeroImageUpload`.
 * Used on event/group/profile edit pages.
 */
export function HeroImagePanel({ entityType, entityId, userId, currentUrl, returnPath }: Props) {
  async function handleSave(url: string | null) {
    await saveHeroImageUrl(entityType, entityId, url, returnPath);
  }

  return (
    <div className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Hero image</h2>
        <p className="text-muted text-xs">
          Wide banner shown at the top of the page. Recommended 1200 × 400 px.
        </p>
      </div>
      <HeroImageUpload
        entityType={entityType}
        entityId={entityId}
        userId={userId}
        currentUrl={currentUrl}
        onSave={handleSave}
      />
    </div>
  );
}
