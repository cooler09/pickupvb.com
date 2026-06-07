/** Flash-param notice banner for community-listing actions (report / claim /
 *  hide / …). Renders nothing for an unknown or absent code. Extracted from
 *  community/[slug]/page.tsx (architecture audit P3-1). */
export function CommunityNoticeBanner({ code }: { code: string | undefined }): React.ReactNode {
  if (!code) return null;
  const messages: Record<string, { tone: 'ok' | 'warn' | 'err'; text: string }> = {
    reported: {
      tone: 'ok',
      text: 'Thanks — your report was recorded. We may hide this listing if more reports come in.',
    },
    already: { tone: 'warn', text: "You've already reported this listing." },
    hidden: { tone: 'ok', text: 'Listing hidden. Only you and platform admins can see it now.' },
    unhidden: { tone: 'ok', text: 'Listing restored.' },
    updated: { tone: 'ok', text: 'Listing updated.' },
    claimed: {
      tone: 'ok',
      text: 'Listing claimed and linked to your event.',
    },
    claimproposed: {
      tone: 'ok',
      text: 'Claim submitted. The original submitter (or a platform admin) will review it before the listing redirects to your event.',
    },
    claimapproved: {
      tone: 'ok',
      text: 'Claim approved. The listing now points to the PickupVB event.',
    },
    claimrejected: {
      tone: 'ok',
      text: 'Claim rejected. The listing is active again.',
    },
    claimfail: {
      tone: 'err',
      text: "That event couldn't be linked. The PickupVB event must be on the same day and in the same city as this listing, and you must host (or co-host) it.",
    },
    notallow: { tone: 'err', text: "You don't have permission to do that." },
    notfound: { tone: 'err', text: 'This listing no longer exists.' },
    error: { tone: 'err', text: 'Something went wrong. Please try again.' },
  };
  const m = messages[code];
  if (!m) return null;
  const toneClass =
    m.tone === 'ok'
      ? 'border-green-200 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200'
      : m.tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
        : 'border-red-200 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200';
  return (
    <div
      role={m.tone === 'err' ? 'alert' : 'status'}
      className={`rounded-md border p-3 text-sm ${toneClass}`}
    >
      {m.text}
    </div>
  );
}
