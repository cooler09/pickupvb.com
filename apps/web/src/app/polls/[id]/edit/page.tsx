import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPollHandlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { PollBuilder } from '../../_components/poll-builder';
import type { PollFormValues } from '../../_components/poll-form-types';

export const metadata: Metadata = { title: 'Edit poll' };

/** ISO instant → `datetime-local` value. Shown in UTC wall-clock (v1 caveat:
 * the browser renders local, so a tz offset can appear on re-edit of the
 * optional close time; the host can just re-pick it). */
function isoToLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : '';
}

export default async function EditPollPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRealUser('/polls');
  const { id } = await params;
  const { getHostPollResults } = await getPollHandlers();
  const poll = await getHostPollResults.execute(id, user.id);
  if (!poll) notFound();

  const initialValues: PollFormValues = {
    title: poll.title,
    description: poll.description,
    closesAt: isoToLocalInput(poll.closesAt),
    showRespondentNames: poll.showRespondentNames,
    questions: poll.questions.map((q) => ({
      prompt: q.prompt,
      kind: q.kind,
      required: q.required,
      options: q.options.map((o) => ({ label: o.label })),
    })),
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-headline-sm font-semibold">Edit poll</h1>
      <div className="mt-6">
        <PollBuilder
          mode="edit"
          pollId={id}
          initialValues={initialValues}
          structuralLocked={poll.responseCount > 0}
        />
      </div>
    </main>
  );
}
