import type { Metadata } from 'next';
import { requireRealUser } from '@/lib/server-auth';
import { PollBuilder } from '../_components/poll-builder';

export const metadata: Metadata = { title: 'Create a poll' };

function first(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function NewPollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRealUser('/polls/new');
  const sp = await searchParams;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-headline-sm font-semibold">Create a poll</h1>
      <p className="text-muted mt-1 text-sm">
        Share a link anyone can answer — no pickupvb account needed.
      </p>
      <div className="mt-6">
        <PollBuilder mode="create" eventId={first(sp['eventId'])} groupId={first(sp['groupId'])} />
      </div>
    </main>
  );
}
