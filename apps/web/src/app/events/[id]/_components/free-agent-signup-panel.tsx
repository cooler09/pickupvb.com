import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { joinAsFreeAgentFromForm, leaveAsFreeAgent } from '../free-agent-actions';

export type FreeAgentEntry = {
  userId: string;
  notes: string | null;
  profile: { displayName: string; avatarUrl: string | null };
};

type Props = {
  eventId: string;
  freeAgents: ReadonlyArray<FreeAgentEntry>;
  /** Is the viewer already signed up as a free agent? */
  isFreeAgent: boolean;
  viewerId: string | null;
  isRealUser: boolean;
  returnPath: string;
  /** Result code from the server action, surfaced via `?fa=` query param. */
  resultCode?: string | undefined;
};

const RESULT_MESSAGES: Record<string, { tone: 'success' | 'error'; text: string }> = {
  joined: { tone: 'success', text: "You're signed up as a free agent." },
  left: { tone: 'success', text: 'Removed from the free-agent pool.' },
  already: { tone: 'error', text: "You're already in the free-agent pool." },
  notin: { tone: 'error', text: "You weren't in the free-agent pool." },
  closed: { tone: 'error', text: "This event isn't open for free-agent signups." },
  signin: { tone: 'error', text: 'Log in to sign up.' },
  anon: { tone: 'error', text: 'Finish creating your account to sign up.' },
  error: { tone: 'error', text: 'Something went wrong. Try again.' },
};

/**
 * Tournament free-agent panel. Renders alongside (not instead of) the
 * team-signup panel — captains can pick free agents up to round out their
 * roster; solo players can advertise themselves without a team.
 */
export function FreeAgentSignupPanel({
  eventId,
  freeAgents,
  isFreeAgent,
  viewerId,
  isRealUser,
  returnPath,
  resultCode,
}: Props) {
  const result = resultCode ? RESULT_MESSAGES[resultCode] : undefined;

  return (
    <section className="border-border-base space-y-4 rounded-lg border p-4">
      <header>
        <h2 className="text-fg text-lg font-semibold">Free agents</h2>
        <p className="text-muted text-sm">
          Don&apos;t have a team? Sign up here so a captain can pick you up.
        </p>
      </header>

      {result && (
        <div
          role={result.tone === 'success' ? 'status' : 'alert'}
          className={`rounded-md border p-3 text-sm ${
            result.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {result.text}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-muted text-sm font-semibold tracking-wide uppercase">
          Available ({freeAgents.length})
        </h3>
        {freeAgents.length === 0 ? (
          <p className="border-border-base text-muted rounded-md border border-dashed p-4 text-center text-sm">
            No free agents yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {freeAgents.map((f) => (
              <li key={f.userId} className="border-border-base bg-surface rounded-md border p-3">
                <p className="text-fg text-sm font-semibold">{f.profile.displayName}</p>
                {f.notes && <p className="text-muted mt-1 text-xs">{f.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!viewerId && (
        <p className="border-border-base text-muted rounded-md border border-dashed p-3 text-sm">
          <Link
            href={`/login?next=${encodeURIComponent(returnPath)}`}
            className="text-primary underline"
          >
            Log in
          </Link>{' '}
          to sign up as a free agent.
        </p>
      )}

      {viewerId && !isRealUser && (
        <p className="border-border-base text-muted rounded-md border border-dashed p-3 text-sm">
          <Link
            href={`/claim?next=${encodeURIComponent(returnPath)}`}
            className="text-primary underline"
          >
            Finish creating your account
          </Link>{' '}
          to sign up as a free agent.
        </p>
      )}

      {viewerId && isRealUser && isFreeAgent && (
        <form action={leaveAsFreeAgent.bind(null, eventId)}>
          <SubmitButton className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
            Remove me from the free-agent pool
          </SubmitButton>
        </form>
      )}

      {viewerId && isRealUser && !isFreeAgent && (
        <form action={joinAsFreeAgentFromForm.bind(null, eventId)} className="space-y-2">
          <label className="block">
            <span className="text-muted text-xs font-medium tracking-wide uppercase">
              Notes (optional)
            </span>
            <textarea
              name="notes"
              rows={2}
              maxLength={280}
              placeholder="e.g. setter, can play Sat morning"
              className="border-border-base bg-surface mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <SubmitButton className="bg-primary rounded-md px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Sign up as free agent
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
