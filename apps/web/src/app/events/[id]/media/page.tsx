import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next/types';
import { notFound } from 'next/navigation';
import { ListEventMediaQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { getViewer } from '@/lib/server-auth';
import { getMediaHandlers } from '@/lib/handlers';
import { loadEventReadModelPublic } from '../_loaders/load-event-detail';
import { AddMediaForm } from './_components/add-media-form';
import { MediaSections } from './_components/media-sections';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOTICES: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  posted: { text: 'Video posted. Thanks for sharing!', tone: 'ok' },
  reported: { text: 'Thanks — our team will take a look.', tone: 'ok' },
  already: { text: "You've already reported this video.", tone: 'warn' },
  removed: { text: 'Video removed.', tone: 'ok' },
  featured: { text: 'Stream featured on the event page.', tone: 'ok' },
  unfeatured: { text: 'Stream un-featured.', tone: 'ok' },
  streamended: { text: 'Stream marked as ended.', tone: 'ok' },
  notallow: { text: "You don't have permission to do that.", tone: 'warn' },
  notfound: { text: 'That video no longer exists.', tone: 'warn' },
  error: { text: 'Something went wrong. Please try again.', tone: 'warn' },
};

function pickQuery(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return { title: 'Videos — PickupVB' };
  try {
    const event = await loadEventReadModelPublic(id);
    return {
      title: `Videos & clips — ${event.title}`,
      alternates: { canonical: `/events/${id}/media` },
    };
  } catch {
    return { title: 'Videos — PickupVB' };
  }
}

export default async function EventMediaPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();

  let event;
  try {
    event = await loadEventReadModelPublic(id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const searchParams = await props.searchParams;
  const viewer = await getViewer();
  const viewerIsRealUser = !!viewer && !viewer.isAnonymous;

  const { listEventMedia } = await getMediaHandlers();
  const media = await listEventMedia.execute(new ListEventMediaQuery(id, viewer?.user.id ?? null));

  const notice = NOTICES[pickQuery(searchParams, 'notice') ?? ''];

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link href={`/events/${id}` as Route} className="text-primary text-sm hover:underline">
        ← Back to event
      </Link>

      <header className="space-y-1">
        <h1 className="text-fg text-2xl font-bold">Videos &amp; clips</h1>
        <p className="text-muted text-sm">{event.title}</p>
      </header>

      {notice && (
        <p
          role="status"
          className={
            notice.tone === 'ok'
              ? 'rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800'
              : 'rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900'
          }
        >
          {notice.text}
        </p>
      )}

      {viewerIsRealUser ? (
        <AddMediaForm eventId={id} />
      ) : (
        <p className="border-border-base text-muted rounded-shape-sm border border-dashed p-4 text-sm">
          <Link href="/login" className="text-primary hover:underline">
            Sign in with a full account
          </Link>{' '}
          to post a stream, video, or clip.
        </p>
      )}

      <MediaSections media={media} eventId={id} viewerIsRealUser={viewerIsRealUser} />
    </article>
  );
}
