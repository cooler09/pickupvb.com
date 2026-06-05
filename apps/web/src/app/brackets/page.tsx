import Link from 'next/link';
import { primaryButtonClass } from '@/components/primary-button';
import type { Route } from 'next';
import { repositories } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { FORMAT_LABEL } from '@/app/events/[id]/bracket/_components/labels';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  setup: 'Setting up',
  draft: 'Draft',
  active: 'In progress',
  completed: 'Completed',
};

/**
 * "My brackets" — the standalone brackets (ADR 0025) a signed-in user owns.
 * Their workspace lives at `/brackets/[id]`; the public watch view at
 * `/brackets/[id]/watch`.
 */
export default async function MyBracketsPage() {
  const { user } = await requireRealUser('/brackets');
  const brackets = await repositories.bracketRepo.listByOwner(user.id as never);

  return (
    <article className="mx-auto max-w-3xl space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-fg text-2xl font-bold">My brackets</h1>
          <p className="text-muted text-sm">
            Run a tournament bracket without hosting an event. Add teams by name, seed, and track
            results.
          </p>
        </div>
        <Link href="/brackets/new" className={primaryButtonClass('md')}>
          New bracket
        </Link>
      </header>

      {brackets.length === 0 ? (
        <p className="border-border-base text-muted rounded-shape-sm border border-dashed p-6 text-center text-sm">
          You haven{'’'}t created any brackets yet. Click <em>New bracket</em> to start one.
        </p>
      ) : (
        <ul className="space-y-2">
          {brackets.map((b) => (
            <li key={b.id}>
              <Link
                href={`/brackets/${b.id}` as Route}
                className="border-border-base hover:bg-fg/5 rounded-shape-sm flex items-center justify-between gap-3 border p-3"
              >
                <span className="space-y-0.5">
                  <span className="text-fg block text-sm font-medium">
                    {FORMAT_LABEL[b.format]}
                  </span>
                  <span className="text-muted block text-xs">
                    {b.teamCount} team{b.teamCount === 1 ? '' : 's'} ·{' '}
                    {STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </span>
                <span className="text-muted text-xs">{b.createdAt.toLocaleDateString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
