import { notFound, redirect } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError, skillTierFromLegacy } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { getViewer, isAnonymousUser } from '@/lib/server-auth';
import { getEventPricing } from '@/lib/event-pricing';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { hasProBenefits } from '@/lib/admin';
import EditEventForm from './edit-event-form';
import { isPricingLocked } from '@/lib/pricing-lock';
import { SponsorPanel } from './sponsor-panel';
import { EventBadgesPanel } from './event-badges-panel';
import { EventWaiverPanel } from './event-waiver-panel';
import { HeroImagePanel } from '@/components/hero-image-panel';
import Link from 'next/link';
import type { Route } from 'next';
import { SubmitButton } from '@/components/submit-button';
import { Alert } from '@/components/alert';
import { primaryButtonClass } from '@/components/primary-button';
import { setEventAcceptsPasses } from './pass-eligibility-actions';
import { setEventPayoutGroup } from './payout-actions';
import { isClubGroup } from '@/lib/club';
import { getGroupStripeAccount } from '@/lib/group-stripe-account';

function pickQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = searchParams?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export const dynamic = 'force-dynamic';

// See note in apps/web/src/app/events/[id]/page.tsx. Reject non-UUID ids
// (e.g. `/events/new/edit` from a crawler) before they hit the DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditEventPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();
  const viewer = await getViewer();
  if (!viewer || !viewer.user) redirect(`/login?next=/events/${id}/edit`);
  if (isAnonymousUser(viewer.user)) redirect(`/events/${id}`);
  const user = viewer.user;

  let event;
  try {
    event = await handlers.getEventDetail.execute(new GetEventDetailQuery(id, user.id));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  if (!event.canManage) redirect(`/events/${id}`);

  // Capacity comes from the first (default) division — ADR 0006 Phase 9b
  // moved capacity off the legacy event columns. Read model already
  // carries divisions[].
  const primaryDiv = event.divisions[0] ?? null;
  const cap = {
    capacity_kind: primaryDiv?.capacityKind ?? null,
    max_spots: primaryDiv?.maxSpots ?? null,
  };

  const admin = getAdminSupabase();
  const pricing = await getEventPricing(id);
  const pricingLocked = await isPricingLocked(id);
  const viewerHasProBenefits = await hasProBenefits(user.id);

  const [
    { data: sponsorRow },
    { data: sponsorAccessRow },
    { data: heroRow },
    { data: badgeRows },
    { data: badgeAccessRow },
  ] = await Promise.all([
    admin
      .from('event_sponsors')
      .select('name, blurb, link_url, logo_url, discount_code')
      .eq('event_id', id)
      .maybeSingle(),
    admin.from('event_sponsor_access').select('paid_at').eq('event_id', id).maybeSingle(),
    admin
      .from('events')
      .select('hero_image_url, accepts_pass_credits, host_group_id, payout_group_id')
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('event_badges')
      .select('id, label, description, icon_url, grant_rule')
      .eq('event_id', id)
      .order('sort_order', { ascending: true }),
    admin.from('event_badge_access').select('paid_at').eq('event_id', id).maybeSingle(),
  ]);
  const badgeAccessPaid = (badgeAccessRow as { paid_at: string | null } | null)?.paid_at != null;

  const sponsor = sponsorRow
    ? {
        name: sponsorRow.name,
        blurb: sponsorRow.blurb,
        linkUrl: sponsorRow.link_url,
        logoUrl: sponsorRow.logo_url,
        discountCode: sponsorRow.discount_code,
      }
    : null;
  // Entitlement now lives in its own table, decoupled from the content row
  // (monetization audit SP-1/SP-2).
  const sponsorEntitledByPayment =
    (sponsorAccessRow as { paid_at: string | null } | null)?.paid_at != null;
  const sponsorFlash = pickQuery(searchParams, 'sponsor');
  const sponsorMsg = pickQuery(searchParams, 'sponsor_msg');

  const hostBadges = (
    (badgeRows as
      | {
          id: string;
          label: string;
          description: string | null;
          icon_url: string | null;
          grant_rule: string;
        }[]
      | null) ?? []
  ).map((b) => ({
    id: b.id,
    label: b.label,
    description: b.description,
    iconUrl: b.icon_url,
    grantRule: b.grant_rule,
  }));
  const badgeFlash = pickQuery(searchParams, 'badge');
  const badgeMsg = pickQuery(searchParams, 'badge_msg');

  const acceptsPassCredits =
    (heroRow as { accepts_pass_credits?: boolean } | null)?.accepts_pass_credits ?? false;
  const passFlash = pickQuery(searchParams, 'pass');
  const passMsg = pickQuery(searchParams, 'pass_msg');

  // ── Group payout (Club) opt-in (ADR 0038) ──
  const eventRow = heroRow as {
    host_group_id?: string | null;
    payout_group_id?: string | null;
  } | null;
  const hostGroupId = eventRow?.host_group_id ?? null;
  const payoutGroupId = eventRow?.payout_group_id ?? null;
  // For a group-hosted event, resolve the group (slug + name) and whether it's a
  // ready Club (active subscription + charges-enabled payout account).
  let hostGroup: { slug: string; name: string; clubReady: boolean } | null = null;
  if (hostGroupId) {
    const { data: gRow } = await admin
      .from('groups')
      .select('slug, name')
      .eq('id', hostGroupId)
      .maybeSingle();
    const g = gRow as { slug: string; name: string } | null;
    if (g) {
      const [club, acct] = await Promise.all([
        isClubGroup(hostGroupId),
        getGroupStripeAccount(hostGroupId),
      ]);
      hostGroup = { slug: g.slug, name: g.name, clubReady: club && Boolean(acct) };
    }
  }
  const payoutFlash = pickQuery(searchParams, 'payout');
  const payoutMsg = pickQuery(searchParams, 'payout_msg');

  const waiverFlash = pickQuery(searchParams, 'waiver');
  const waiverMsg = pickQuery(searchParams, 'waiver_msg');

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-headline-lg font-bold">Edit event</h1>
        <p className="text-muted text-sm">
          Update details for <span className="font-medium">{event.title}</span>.
        </p>
      </header>
      <EditEventForm
        eventId={id}
        isOpenPlay={event.type === 'open_play'}
        pricingLocked={pricingLocked}
        viewerHasProBenefits={viewerHasProBenefits}
        initial={{
          title: event.title,
          description: event.description ?? '',
          rules: event.rules ?? '',
          skillTier: primaryDiv?.skillTier ?? skillTierFromLegacy(event.skillLevel),
          visibility: event.visibility,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          capacityKind: cap.capacity_kind,
          maxSpots: cap.max_spots,
          addressLine: event.location.addressLine,
          city: event.location.city,
          region: event.location.region,
          postalCode: event.location.postalCode,
          country: event.location.country,
          priceUsd: pricing ? (pricing.priceCents / 100).toFixed(2) : '0.00',
          refundWindowHours: pricing?.refundWindowHours ?? 24,
          hostAbsorbsFee: pricing?.hostAbsorbsFee ?? false,
          passProcessingFeeToBuyer: pricing?.passProcessingFeeToBuyer ?? false,
          paymentsOffPlatform: event.paymentsOffPlatform,
          extensions: {
            venueName: event.venueName,
            registrationClosesAt: event.registrationClosesAt,
            seriesName: event.seriesName,
            seriesPosition: event.seriesPosition,
            seriesSize: event.seriesSize,
            isFundraiser: event.isFundraiser,
            fundraiserBeneficiary: event.fundraiserBeneficiary,
            themeTags: [...event.themeTags],
            sanctioningBody: event.sanctioningBody,
            registrationMode: event.registrationMode,
            externalRegistrationUrl: event.externalRegistrationUrl,
            externalRegistrationInstructions: event.externalRegistrationInstructions,
            paymentInstructions: event.paymentInstructions,
          },
        }}
      />

      {/*
        Supplementary panels below have their own independent save flows
        (hero image uploads on file pick; sponsor has its own Save button).
        Group them under a divider + "saves independently" caption so the
        "Save changes" button above doesn't read as the page-terminal CTA.
      */}
      <div className="space-y-4 pt-4">
        <div className="border-border-base border-t pt-4">
          <h2 className="text-fg text-lg font-semibold">Additional settings</h2>
          <p className="text-muted text-sm">Each section below saves on its own.</p>
        </div>

        <HeroImagePanel
          entityType="events"
          entityId={id}
          userId={user.id}
          currentUrl={(heroRow as { hero_image_url: string | null } | null)?.hero_image_url ?? null}
          returnPath={`/events/${id}`}
        />

        <SponsorPanel
          eventId={id}
          userId={user.id}
          returnPath={`/events/${id}/edit`}
          sponsor={sponsor}
          canUseSponsors={viewerHasProBenefits || sponsorEntitledByPayment}
          {...(sponsorFlash ? { sponsorFlash } : {})}
          {...(sponsorMsg ? { sponsorMsg } : {})}
        />

        <EventBadgesPanel
          eventId={id}
          userId={user.id}
          returnPath={`/events/${id}/edit`}
          badges={hostBadges}
          canUseBadges={viewerHasProBenefits || badgeAccessPaid}
          {...(badgeFlash ? { badgeFlash } : {})}
          {...(badgeMsg ? { badgeMsg } : {})}
        />

        <EventWaiverPanel
          eventId={id}
          returnPath={`/events/${id}`}
          {...(waiverFlash ? { flashCode: waiverFlash } : {})}
          {...(waiverMsg ? { flashMsg: waiverMsg } : {})}
        />

        {event.type === 'open_play' && viewerHasProBenefits && (
          <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-5">
            <div>
              <h3 className="text-fg font-semibold">Season passes</h3>
              <p className="text-muted text-sm">
                Let buyers of your{' '}
                <Link
                  href={'/profile/billing/passes' as Route}
                  className="text-primary hover:underline"
                >
                  pass credits
                </Link>{' '}
                redeem one to sign up for this event — no per-session charge.
              </p>
            </div>
            {passFlash === 'eligibility_saved' && <Alert variant="success">Saved.</Alert>}
            {passFlash === 'pro' && (
              <Alert variant="warning" title="Pro required">
                Passes are a Pro feature.
              </Alert>
            )}
            {passFlash === 'error' && (
              <Alert variant="error" title="Couldn’t save">
                {passMsg || 'Please try again.'}
              </Alert>
            )}
            <form
              action={setEventAcceptsPasses.bind(null, id, `/events/${id}`)}
              className="flex flex-wrap items-center gap-3"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="accepts"
                  defaultChecked={acceptsPassCredits}
                  className="h-4 w-4"
                />
                Accept pass credits for this event
              </label>
              <SubmitButton className={primaryButtonClass('sm')} pendingChildren="Saving…">
                Save
              </SubmitButton>
            </form>
          </section>
        )}

        {hostGroup && (
          <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-5">
            <div>
              <h3 className="text-fg font-semibold">Club payouts</h3>
              <p className="text-muted text-sm">
                Route this event&apos;s ticket, team &amp; tip payouts to your club&apos;s shared
                Stripe account instead of your personal one.
              </p>
            </div>
            {payoutFlash === 'saved' && <Alert variant="success">Saved.</Alert>}
            {payoutFlash === 'locked' && (
              <Alert variant="warning" title="Locked">
                {payoutMsg || 'Payout routing is locked once a registration is paid.'}
              </Alert>
            )}
            {(payoutFlash === 'needs_club' ||
              payoutFlash === 'group_not_ready' ||
              payoutFlash === 'no_group' ||
              payoutFlash === 'unauthorized' ||
              payoutFlash === 'error') && (
              <Alert variant="error" title="Couldn’t save">
                {payoutMsg || 'Could not update payout routing.'}
              </Alert>
            )}
            {hostGroup.clubReady ? (
              pricingLocked ? (
                <p className="text-muted text-sm">
                  {payoutGroupId ? `Paying out to ${hostGroup.name}.` : 'Paying out to you.'}{' '}
                  Routing is locked because a registration has been paid.
                </p>
              ) : (
                <form
                  action={setEventPayoutGroup.bind(null, id, `/events/${id}`)}
                  className="flex flex-wrap items-center gap-3"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="route"
                      defaultChecked={payoutGroupId != null}
                      className="h-4 w-4"
                    />
                    Pay out to {hostGroup.name}
                  </label>
                  <SubmitButton className={primaryButtonClass('sm')} pendingChildren="Saving…">
                    Save
                  </SubmitButton>
                </form>
              )
            ) : (
              <p className="text-muted text-sm">
                Your club needs an active{' '}
                <Link
                  href={`/groups/${hostGroup.slug}/billing` as Route}
                  className="text-primary hover:underline"
                >
                  Club subscription + payout account
                </Link>{' '}
                before events can route payouts to it.
              </p>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
