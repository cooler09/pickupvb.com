import { Alert } from '@/components/alert';

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
  const variant = m.tone === 'ok' ? 'success' : m.tone === 'warn' ? 'warning' : 'error';
  return (
    <Alert variant={variant} role={m.tone === 'err' ? 'alert' : 'status'}>
      {m.text}
    </Alert>
  );
}
