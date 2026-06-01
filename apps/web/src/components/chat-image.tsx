'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import type { MessageAttachmentView } from '@pickupvb/domain';

const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Renders one chat image attachment (ADR 0028, Phase 4). The bucket is private,
 * so there is no stable public URL — the component mints a short-lived signed
 * URL on mount (RLS lets a conversation member sign; non-members can't, so this
 * is the read gate). `width`/`height` reserve layout space to avoid reflow.
 *
 * Plain `<img>` rather than `next/image`: signed URLs are ephemeral (token +
 * expiry) and per-viewer, so they don't fit the static-optimization model.
 */
export function ChatImage({ attachment }: { attachment: MessageAttachmentView }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    void supabase.storage
      .from(attachment.bucket)
      .createSignedUrl(attachment.path, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.bucket, attachment.path]);

  const ratio =
    attachment.width && attachment.height ? `${attachment.width} / ${attachment.height}` : '4 / 3';

  if (failed) {
    return <p className="text-muted text-xs italic">Image unavailable</p>;
  }
  if (!url) {
    return (
      <span
        aria-hidden
        className="bg-fg/10 block w-full max-w-xs animate-pulse rounded-md"
        style={{ aspectRatio: ratio }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ephemeral per-viewer signed URL; not a fit for next/image
    <img
      src={url}
      alt="Image attachment"
      loading="lazy"
      className="max-h-64 w-auto max-w-xs rounded-md object-cover"
    />
  );
}
