import Link from 'next/link';
import type { Metadata } from 'next';
import { getPollHandlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { primaryButtonClass } from '@/components/primary-button';

export const metadata: Metadata = { title: 'My polls' };

export default async function PollsListPage() {
  const { user } = await requireRealUser('/polls');
  const { listCreatorPolls } = await getPollHandlers();
  const polls = await listCreatorPolls.execute(user.id);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-headline-sm font-semibold">My polls</h1>
        <Link href="/polls/new" className={primaryButtonClass('md')}>
          New poll
        </Link>
      </div>

      {polls.length === 0 ? (
        <p className="text-muted text-sm">
          No polls yet. Create one to gather quick answers — share the link anywhere, no account
          needed to respond.
        </p>
      ) : (
        <ul className="divide-border-base border-border-base divide-y rounded-md border">
          {polls.map((p) => (
            <li key={p.id}>
              <Link
                href={`/polls/${p.id}`}
                className="hover:bg-md-surface-container-high flex items-center justify-between gap-3 p-4"
              >
                <span className="min-w-0">
                  <span className="text-fg block truncate font-medium">{p.title}</span>
                  <span className="text-muted text-xs">
                    {p.questionCount} {p.questionCount === 1 ? 'question' : 'questions'} ·{' '}
                    {p.responseCount} {p.responseCount === 1 ? 'response' : 'responses'}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.status === 'open'
                      ? 'bg-md-success/15 text-md-success'
                      : 'bg-md-error/15 text-md-error'
                  }`}
                >
                  {p.status === 'open' ? 'Open' : 'Closed'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
