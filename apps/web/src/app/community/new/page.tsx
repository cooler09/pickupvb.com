import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/server-auth';
import NewCommunityListingForm from './community-listing-form';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Submit a community listing — PickupVB',
  robots: { index: false, follow: false },
};

export default async function NewCommunityListingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/community/new');
  if (viewer.isAnonymous) redirect('/claim?next=/community/new');

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-headline-lg font-bold">Submit a community listing</h1>
        <p className="text-muted text-sm">
          Share a volleyball event from Facebook, Meetup, or anywhere else on the web. Your listing
          links out to the original source — players RSVP there.
        </p>
        <p className="text-muted text-xs">
          You can submit up to 5 listings per day. Listings are visible to everyone right away, but
          may be hidden after multiple reports.
        </p>
      </header>
      <NewCommunityListingForm />
    </section>
  );
}
