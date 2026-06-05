'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

type Props = {
  /** Event id — second path segment in Storage. */
  eventId: string;
  /** Authenticated user's id — first path segment in Storage (RLS gate). */
  userId: string;
  /** This badge's id — fourth path segment so each badge gets its own object. */
  badgeId: string;
};

const MAX_BYTES = 1 * 1024 * 1024; // 1 MB — badge icons are small

/**
 * Icon uploader for a host event badge. Clone of `SponsorLogoUpload`: uploads
 * to the public `event-badges` bucket via the browser client (RLS gates writes
 * to the caller's own user_id prefix) under
 * `{userId}/{eventId}/badges/{badgeId}.{ext}`, then mirrors the public URL into
 * a hidden `icon_url` input so the surrounding `<form action={...}>` submits it.
 */
export function EventBadgeIconUpload({ eventId, userId, badgeId }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError('Icon must be under 1 MB.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `${userId}/${eventId}/badges/${badgeId}.${ext}`;
    setUploading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: uploadErr } = await supabase.storage
      .from('event-badges')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadErr) {
      setError('Upload failed. Please try again.');
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('event-badges').getPublicUrl(path);
    setUrl(`${data.publicUrl}?t=${Date.now()}`);
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <span className="text-fg block text-sm font-medium">Badge icon (optional)</span>
      <input type="hidden" name="icon_url" value={url ?? ''} />

      {url ? (
        <div className="flex items-center gap-3">
          <Image
            src={url}
            alt="Badge icon preview"
            width={48}
            height={48}
            unoptimized
            className="border-border-base bg-surface h-12 w-12 rounded-full border object-cover"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-fg hover:text-primary focus-visible:ring-primary rounded text-sm font-medium focus:outline-none focus-visible:ring-2 disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Change'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="border-border-base text-muted hover:border-primary hover:text-fg focus-visible:ring-primary rounded-shape-sm flex w-full flex-col items-center gap-1 border-2 border-dashed py-4 transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-60"
        >
          {uploading ? (
            <span className="text-sm">Uploading…</span>
          ) : (
            <>
              <span className="text-sm font-medium">Upload icon</span>
              <span className="text-xs">PNG, JPEG, or WebP · Max 1 MB · Square works best</span>
            </>
          )}
        </button>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
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
