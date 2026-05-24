import { notFound, redirect } from 'next/navigation';
import { GetCommunityListingDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { getViewer } from '@/lib/server-auth';
import EditCommunityListingForm, {
  type EditFormInitialValues,
} from './community-listing-edit-form';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Edit community listing — PickupVB',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EditCommunityListingPage(props: PageProps) {
  const { slug } = await props.params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/community/${slug}/edit`);
  if (viewer.isAnonymous) redirect(`/claim?next=/community/${slug}/edit`);

  let detail;
  try {
    detail = await handlers.getCommunityListingDetail.execute(
      new GetCommunityListingDetailQuery(slug, viewer.user.id),
    );
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  if (!detail) notFound();

  if (!detail.canManage) redirect(`/community/${slug}?notice=notallow`);
  if (
    detail.status === 'claimed' ||
    detail.status === 'removed' ||
    detail.status === 'claim_pending'
  ) {
    redirect(`/community/${slug}?notice=notallow`);
  }

  const initial: EditFormInitialValues = {
    id: detail.id,
    slug: detail.slug,
    title: detail.title,
    description: detail.description,
    externalUrl: detail.externalUrl,
    externalHostName: detail.externalHostName,
    startsAt: detail.startsAt,
    endsAt: detail.endsAt,
    location: detail.location
      ? {
          addressLine: detail.location.addressLine,
          city: detail.location.city,
          region: detail.location.region,
          postalCode: detail.location.postalCode,
          country: detail.location.country,
        }
      : null,
    surface: detail.surface,
    format: detail.format,
    skillLevel: detail.skillLevel,
  };

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Edit community listing</h1>
        <p className="text-muted text-sm">
          Make changes to your submission. Listings that have been claimed or removed can&rsquo;t be
          edited.
        </p>
      </header>
      <EditCommunityListingForm initial={initial} />
    </section>
  );
}
