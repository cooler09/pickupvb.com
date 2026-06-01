'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { AvatarCropDialog } from './avatar-crop-dialog';

type Props = {
  /** Authenticated user's id — the first path segment in Storage (RLS gate). */
  userId: string;
  currentUrl: string | null;
  /** Two-letter initials shown in the placeholder circle before an upload. */
  initials: string;
  /** Called with the new public URL after a successful upload, or null on removal. */
  onSave: (url: string | null) => Promise<void>;
  /**
   * Storage object path to write (within the `avatars` bucket). Defaults to
   * `${userId}/avatar.webp` (the user's own avatar). Group avatars pass
   * `${userId}/groups/${groupId}/avatar.webp` — the leading `${userId}/`
   * segment satisfies the bucket's owner-path RLS, and the
   * `purge_avatar_orphans` walker treats it as live via `groups.avatar_url`.
   */
  objectPath?: string;
  /**
   * Preview + crop shape. `'circle'` (default) for people; `'rounded'` for
   * group logos, matching how each is rendered elsewhere.
   */
  shape?: 'circle' | 'rounded';
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB cap on the *source* file (pre-crop)

/**
 * File-picker + crop upload widget for the user's avatar (profile picture).
 *
 * Flow: pick a file → AvatarCropDialog opens with a round, aspect-locked
 * crop + zoom → on confirm we get a square WebP blob, upload it to the
 * `avatars` Supabase Storage bucket via the browser client (RLS gates writes
 * to the caller's own user_id path prefix), then call `onSave` so the parent
 * can persist the URL via a server action. Because the crop output is always
 * WebP, the storage object is always `avatar.webp` — a re-upload overwrites
 * the same path rather than leaving a stale extension behind.
 */
export function AvatarUpload({
  userId,
  currentUrl,
  initials,
  onSave,
  objectPath,
  shape = 'circle',
}: Props) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const roundedClass = shape === 'rounded' ? 'rounded-shape-sm' : 'rounded-full';

  // Revoke any outstanding object URL on unmount to avoid leaking it.
  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  function handlePickedFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError('Image must be under 10 MB.');
      return;
    }
    setError(null);
    setCropSrc(URL.createObjectURL(file));
  }

  function closeCropper() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function handleCropped(blob: Blob) {
    // Crop output is always WebP, so the object path is stable.
    const path = objectPath ?? `${userId}/avatar.webp`;
    setUploading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/webp' });

    if (uploadErr) {
      setError('Upload failed. Please try again.');
      setUploading(false);
      closeCropper();
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Append a cache-buster so a re-upload to the same path defeats the CDN
    // cache and shows immediately. The orphan-sweep walker tolerates the
    // `?t=…` suffix in its liveness check (purge_avatar_orphans).
    const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
    await onSave(publicUrl);
    setUrl(publicUrl);
    setUploading(false);
    closeCropper();
  }

  async function handleRemove() {
    await onSave(null);
    setUrl(null);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 shrink-0">
        {url ? (
          <Image
            src={url}
            alt="Avatar"
            fill
            sizes="80px"
            className={`${roundedClass} object-cover`}
          />
        ) : (
          <div
            aria-hidden
            className={`bg-primary/15 text-primary flex h-20 w-20 items-center justify-center ${roundedClass} text-2xl font-semibold`}
          >
            {initials}
          </div>
        )}
        {uploading && (
          <div
            className={`absolute inset-0 flex items-center justify-center ${roundedClass} bg-black/50 backdrop-blur-sm`}
          >
            <span className="text-xs font-medium text-white">…</span>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-fg hover:text-primary focus-visible:ring-primary rounded text-sm font-medium focus:outline-none focus-visible:ring-2 disabled:opacity-60"
          >
            {url ? 'Change photo' : 'Upload photo'}
          </button>
          {url && !uploading && (
            <>
              <span aria-hidden="true" className="text-border-base select-none">
                ·
              </span>
              <button
                type="button"
                onClick={() => void handleRemove()}
                className="text-muted hover:text-destructive focus-visible:ring-primary rounded text-sm focus:outline-none focus-visible:ring-2"
              >
                Remove
              </button>
            </>
          )}
        </div>
        <p className="text-muted text-xs">JPEG, PNG, or WebP · Max 10 MB</p>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePickedFile(file);
          e.target.value = '';
        }}
      />

      <AvatarCropDialog
        imageSrc={cropSrc}
        cropShape={shape === 'rounded' ? 'rect' : 'round'}
        onConfirm={handleCropped}
        onCancel={closeCropper}
      />
    </div>
  );
}
