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
import { CancelEventPanel } from './cancel-event-panel';
import { SponsorPanel } from './sponsor-panel';
import { HeroImagePanel } from '@/components/hero-image-panel';

function pickQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = searchParams?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export const dynamic = 'force-dynamic';

export default async function EditEventPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const { id } = await props.params;
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

  const [{ data: sponsorRow }, { data: heroRow }] = await Promise.all([
    admin
      .from('event_sponsors')
      .select('name, blurb, link_url, logo_url, discount_code, access_kind, paid_at')
      .eq('event_id', id)
      .maybeSingle(),
    admin.from('events').select('hero_image_url').eq('id', id).maybeSingle(),
  ]);

  const sponsor = sponsorRow
    ? {
        name: sponsorRow.name,
        blurb: sponsorRow.blurb,
        linkUrl: sponsorRow.link_url,
        logoUrl: sponsorRow.logo_url,
        discountCode: sponsorRow.discount_code,
      }
    : null;
  const sponsorEntitledByPayment =
    sponsorRow?.access_kind === 'ala_carte' && sponsorRow?.paid_at !== null;
  const sponsorFlash = pickQuery(searchParams, 'sponsor');
  const sponsorMsg = pickQuery(searchParams, 'sponsor_msg');

  // For the cancel panel: how many paid attendees would be refunded.
  let paidAttendeeCount = 0;
  if (event.status !== 'cancelled') {
    const { count } = await admin
      .from('event_attendees')
      .select('user_id', { head: true, count: 'exact' })
      .eq('event_id', id)
      .eq('payment_status', 'paid');
    paidAttendeeCount = count ?? 0;
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Edit event</h1>
        <p className="text-muted text-sm">
          Update details for <span className="font-medium">{event.title}</span>.
        </p>
      </header>
      <EditEventForm
        eventId={id}
        isOpenPlay={event.type === 'open_play'}
        pricingLocked={pricingLocked}
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
          teamRegistrationMode: event.teamRegistrationMode,
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

      <HeroImagePanel
        entityType="events"
        entityId={id}
        userId={user.id}
        currentUrl={(heroRow as { hero_image_url: string | null } | null)?.hero_image_url ?? null}
        returnPath={`/events/${id}`}
      />

      <SponsorPanel
        eventId={id}
        returnPath={`/events/${id}/edit`}
        sponsor={sponsor}
        canUseSponsors={viewerHasProBenefits || sponsorEntitledByPayment}
        {...(sponsorFlash ? { sponsorFlash } : {})}
        {...(sponsorMsg ? { sponsorMsg } : {})}
      />

      {event.status !== 'cancelled' && (
        <CancelEventPanel
          eventId={id}
          attendeeCount={event.attendees.filter((a) => !a.waitlist).length}
          paidAttendeeCount={paidAttendeeCount}
        />
      )}
    </section>
  );
}
