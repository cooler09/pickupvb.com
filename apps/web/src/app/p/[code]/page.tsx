import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicPollConfig, getPublicPollResults } from '@/lib/polls-public';
import { PollResponder } from './_components/poll-responder';

// Sessionless + cacheable: the page body reads only via the anon client (no
// cookies()), so it stays CDN-cacheable. Viewer-specific behaviour (the form,
// the cookie, the live tally) lives in the client island.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const config = await getPublicPollConfig(code);
  if (!config) return { title: 'Poll' };
  return {
    title: config.title,
    description: config.description || 'Answer this quick poll — no account needed.',
  };
}

export default async function PublicPollPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [config, initialResults] = await Promise.all([
    getPublicPollConfig(code),
    getPublicPollResults(code),
  ]);
  if (!config) notFound();

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-headline-sm font-semibold">{config.title}</h1>
        {config.description && <p className="text-muted text-sm">{config.description}</p>}
      </div>

      <div className="mt-6">
        <PollResponder
          config={config}
          initialResults={initialResults}
          isClosed={config.status === 'closed'}
        />
      </div>

      <div className="border-border-base mt-10 border-t pt-4 text-center">
        <Link href="/polls/new" className="text-muted hover:text-primary text-xs">
          Create your own free poll on pickupvb →
        </Link>
      </div>
    </main>
  );
}
