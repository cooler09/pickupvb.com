'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

type Props = {
  /** Authenticated user's id — the first path segment in Storage (RLS gate). */
  userId: string;
  currentUrl: string | null;
  /** Two-letter initials shown in the placeholder circle before an upload. */
  initials: string;
  /** Called with the new public URL after a successful upload, or null on removal. */
  onSave: (url: string | null) => Promise<void>;
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * File-picker upload widget for the user's avatar (profile picture). Uploads
 * directly to the `avatars` Supabase Storage bucket using the browser client
 * (RLS gates writes to the caller's own user_id path prefix), then calls
 * `onSave` so the parent can persist the URL via a server action.
 *
 * The image is displayed in a circular frame with `object-cover`, so a
 * non-square upload is center-cropped at render time — no client-side crop
 * tool (matches the HeroImageUpload accept-as-is behaviour).
 */
export function AvatarUpload({ userId, currentUrl, initials, onSave }: Props) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError('Image must be under 5 MB.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    // Path: {userId}/avatar.{ext}
    const path = `${userId}/avatar.${ext}`;
    setUploading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadErr) {
      setError('Upload failed. Please try again.');
      setUploading(false);
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
            alt="Your avatar"
            fill
            sizes="80px"
            className="rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="bg-primary/15 text-primary flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold"
          >
            {initials}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
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
        <p className="text-muted text-xs">JPEG, PNG, or WebP · Max 5 MB · Square works best</p>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
