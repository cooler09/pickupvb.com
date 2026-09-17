import Link from 'next/link';
import type { Route } from 'next';
import { getPollHandlers } from '@/lib/handlers';
import { PollsListPanel } from '@/app/polls/_components/polls-list-panel';
import { requireGroupManager } from '../_lib/require-group-manager';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Group polls — PickupVB',
  robots: { index: false, follow: false },
};

export default async function GroupPollsPage(props: { params: Promise<{ id: string }> }) {
  const { id: slug } = await props.params;
  const { group } = await requireGroupManager(slug, `/groups/${slug}/polls`);

  // Creator-only RLS: a manager sees their own polls for the group; surfacing a
  // co-manager's polls to the whole team is a documented follow-up.
  const { listGroupPolls } = await getPollHandlers();
  const polls = await listGroupPolls.execute(group.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <Link
        href={`/groups/${group.slug}` as Route}
        className="text-primary text-sm hover:underline"
      >
        ← Back to {group.name}
      </Link>
      <PollsListPanel polls={polls} newHref={`/polls/new?groupId=${group.id}` as Route} />
    </div>
  );
}
