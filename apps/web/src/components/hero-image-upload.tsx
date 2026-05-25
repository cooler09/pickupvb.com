'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

type EntityType = 'events' | 'groups' | 'profiles';

type Props = {
  entityType: EntityType;
  entityId: string;
  /** Authenticated user's id — used as the first path segment in Storage. */
  userId: string;
  currentUrl: string | null;
  /** Called with the new public URL after a successful upload, or null on removal. */
  onSave: (url: string | null) => Promise<void>;
};

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * File-picker upload widget for hero banner images. Uploads directly to
 * Supabase Storage using the browser client (RLS gates writes to the
 * caller's own user_id path prefix), then calls `onSave` so the parent can
 * persist the URL via a server action.
 */
export function HeroImageUpload({ entityType, entityId, userId, currentUrl, onSave }: Props) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError('Image must be under 8 MB.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    // Path: {userId}/{entityType}/{entityId}/hero.{ext}
    const path = `${userId}/${entityType}/${entityId}/hero.${ext}`;
    setUploading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: uploadErr } = await supabase.storage
      .from('hero-images')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadErr) {
      setError('Upload failed. Please try again.');
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('hero-images').getPublicUrl(path);
    // Bust the CDN cache by appending a short cache-buster so the new image
    // shows immediately rather than serving the stale object.
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
    <div className="space-y-2">
      <div className="border-border-base bg-fg/5 relative h-40 w-full overflow-hidden rounded-lg border">
        {url ? (
          <Image src={url} alt="" fill className="object-cover" />
        ) : (
          <div className="from-primary/15 to-highlight/30 h-full w-full bg-gradient-to-br" />
        )}
        <div className="absolute right-2 bottom-2 flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="border-border-base bg-surface text-fg hover:bg-fg/5 focus-visible:ring-primary rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : url ? 'Change' : 'Upload image'}
          </button>
          {url && !uploading && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              className="border-border-base bg-surface text-fg hover:bg-fg/5 focus-visible:ring-primary rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-secondary text-xs">{error}</p>}
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
      <p className="text-muted text-xs">JPEG, PNG, or WebP · Max 8 MB · Recommended 1200 × 400</p>
    </div>
  );
}
