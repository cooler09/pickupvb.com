import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPollHandlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { neutralButtonClass } from '@/components/primary-button';
import { DisplayLinkRow } from '@/app/events/[id]/manage/_components/display-link-row';
import { PollAdminControls } from './_components/poll-admin-controls';

export const metadata: Metadata = { title: 'Poll results' };

export default async function PollDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRealUser('/polls');
  const { id } = await params;
  const { getHostPollResults } = await getPollHandlers();
  const poll = await getHostPollResults.execute(id, user.id);
  if (!poll) notFound();

  const nameById = new Map<string, string>();
  for (const q of poll.questions) for (const o of q.options) nameById.set(o.id, o.label);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-headline-sm font-semibold">{poll.title}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              poll.status === 'open'
                ? 'bg-md-success/15 text-md-success'
                : 'bg-md-error/15 text-md-error'
            }`}
          >
            {poll.status === 'open' ? 'Open' : 'Closed'}
          </span>
        </div>
        {poll.description && <p className="text-muted text-sm">{poll.description}</p>}
        <p className="text-muted text-sm">
          {poll.responseCount} {poll.responseCount === 1 ? 'response' : 'responses'}
          {poll.showRespondentNames ? '' : ' · names hidden on the public page'}
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-title-lg font-semibold">Share</h2>
        <DisplayLinkRow title="Poll link" path={`/p/${poll.shortCode}`} />
      </div>

      <PollAdminControls pollId={poll.id} status={poll.status} />

      <div className="space-y-6">
        <h2 className="text-title-lg font-semibold">Results</h2>
        {poll.questions.map((q) => {
          const max = q.options.reduce((m, o) => Math.max(m, o.count), 0);
          return (
            <div key={q.id} className="space-y-3">
              <p className="text-fg font-medium">
                {q.prompt}{' '}
                <span className="text-muted text-xs font-normal">
                  ({q.kind === 'single' ? 'pick one' : 'pick many'})
                </span>
              </p>
              <div className="space-y-2">
                {q.options.map((o) => (
                  <div key={o.id}>
                    <div className="mb-0.5 flex items-center justify-between text-sm">
                      <span>{o.label}</span>
                      <span className="text-muted tabular-nums">{o.count}</span>
                    </div>
                    <div className="bg-md-surface-container-high h-2 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: max > 0 ? `${(o.count / max) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {poll.responseCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-title-lg font-semibold">Respondents</h2>
            <a
              href={`/api/polls/${poll.id}/responses.csv`}
              className={neutralButtonClass('sm')}
              download
            >
              Export CSV
            </a>
          </div>
          <ul className="divide-border-base border-border-base divide-y rounded-md border">
            {poll.responses.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:justify-between"
              >
                <span className="text-fg font-medium">{r.respondentName}</span>
                <span className="text-muted">
                  {r.optionIds
                    .map((oid) => nameById.get(oid))
                    .filter(Boolean)
                    .join(', ') || '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
