'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

type Props = {
  /** Event id — second path segment in Storage. */
  eventId: string;
  /** Authenticated user's id — first path segment in Storage (RLS gate). */
  userId: string;
  /** Currently-saved logo URL, if any. */
  currentUrl: string | null;
};

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — logos are small

/**
 * File-picker upload widget for the sponsor logo. Uploads directly to the
 * `sponsor-logos` Supabase Storage bucket via the browser client (RLS gates
 * writes to the caller's own user_id path prefix), then mirrors the resulting
 * public URL into a hidden `logo_url` input so the surrounding plain
 * `<form action={...}>` (save or à-la-carte unlock) submits it unchanged.
 *
 * Why upload instead of a pasted URL: an arbitrary CDN URL fails the CSP
 * `img-src` allowlist and cross-origin embedding protections we can't control.
 * A supabase Storage URL is already allowlisted, so the logo always renders.
 */
export function SponsorLogoUpload({ eventId, userId, currentUrl }: Props) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError('Logo must be under 4 MB.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    // Path: {userId}/{eventId}/logo.{ext}
    const path = `${userId}/${eventId}/logo.${ext}`;
    setUploading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: uploadErr } = await supabase.storage
      .from('sponsor-logos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadErr) {
      setError('Upload failed. Please try again.');
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('sponsor-logos').getPublicUrl(path);
    // Cache-buster so a re-upload to the same path shows immediately rather
    // than serving the stale CDN object.
    setUrl(`${data.publicUrl}?t=${Date.now()}`);
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <span className="text-fg block text-sm font-medium">Sponsor logo</span>
      {/* Hidden field consumed by upsertSponsorFromForm / checkout actions. */}
      <input type="hidden" name="logo_url" value={url ?? ''} />

      {url ? (
        <div className="flex items-center gap-3">
          <Image
            src={url}
            alt="Sponsor logo preview"
            width={48}
            height={48}
            unoptimized
            className="border-border-base bg-md-surface-container h-12 w-12 rounded-md border object-contain"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-fg hover:text-primary focus-visible:ring-primary rounded text-sm font-medium focus:outline-none focus-visible:ring-2 disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Change'}
          </button>
          <span aria-hidden="true" className="text-border-base select-none">
            ·
          </span>
          <button
            type="button"
            onClick={() => setUrl(null)}
            disabled={uploading}
            className="text-muted hover:text-md-error focus-visible:ring-primary rounded text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-60"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="border-border-base text-muted hover:border-primary hover:text-fg focus-visible:ring-primary rounded-shape-sm flex w-full flex-col items-center gap-1 border-2 border-dashed py-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {uploading ? (
            <span className="text-sm">Uploading…</span>
          ) : (
            <>
              <span className="text-sm font-medium">Upload logo</span>
              <span className="text-xs">JPEG, PNG, or WebP · Max 4 MB · Square works best</span>
            </>
          )}
        </button>
      )}
      {error && <p className="text-md-error text-xs">{error}</p>}
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
