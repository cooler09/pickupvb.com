import Link from 'next/link';
import { errorButtonClass, primaryButtonClass } from '@/components/primary-button';
import { SubmitButton } from '@/components/submit-button';
import type { Route } from 'next';
import { repositories } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { UserId } from '@pickupvb/domain';
import { FORMAT_LABEL } from '@/app/events/[id]/bracket/_components/labels';
import { deleteStandaloneBracket } from './actions';

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
  const brackets = await repositories.bracketRepo.listByOwner(UserId(user.id));

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
            <li key={b.id} className="border-border-base rounded-shape-sm border">
              <Link
                href={`/brackets/${b.id}` as Route}
                className="hover:bg-fg/5 rounded-shape-sm flex items-center justify-between gap-3 p-3"
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
              <details className="border-border-base/60 border-t">
                <summary className="text-muted hover:text-fg cursor-pointer px-3 py-1.5 text-xs select-none">
                  Delete bracket
                </summary>
                <div className="space-y-2 px-3 pb-3">
                  <p className="text-muted text-xs">
                    Permanently removes this bracket and all its teams, matches, and results. This
                    can{'’'}t be undone.
                  </p>
                  <form action={deleteStandaloneBracket.bind(null, b.id)}>
                    <SubmitButton className={errorButtonClass('sm')}>Delete bracket</SubmitButton>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
