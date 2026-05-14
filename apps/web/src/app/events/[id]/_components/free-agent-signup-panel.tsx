import Link from 'next/link';
import {
    joinAsFreeAgentFromForm,
    leaveAsFreeAgent,
} from '../free-agent-actions';

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
        <section className="space-y-4 rounded-lg border border-border-base p-4">
            <header>
                <h2 className="text-lg font-semibold text-fg">Free agents</h2>
                <p className="text-sm text-muted">
                    Don&apos;t have a team? Sign up here so a captain can pick you up.
                </p>
            </header>

            {result && (
                <div
                    className={`rounded-md border p-3 text-sm ${result.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                >
                    {result.text}
                </div>
            )}

            <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                    Available ({freeAgents.length})
                </h3>
                {freeAgents.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border-base p-4 text-center text-sm text-muted">
                        No free agents yet.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {freeAgents.map((f) => (
                            <li
                                key={f.userId}
                                className="rounded-md border border-border-base bg-surface p-3"
                            >
                                <p className="text-sm font-semibold text-fg">
                                    {f.profile.displayName}
                                </p>
                                {f.notes && (
                                    <p className="mt-1 text-xs text-muted">{f.notes}</p>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {!viewerId && (
                <p className="rounded-md border border-dashed border-border-base p-3 text-sm text-muted">
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
                <p className="rounded-md border border-dashed border-border-base p-3 text-sm text-muted">
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
                    <button
                        type="submit"
                        className="text-xs font-medium text-red-600 hover:underline"
                    >
                        Remove me from the free-agent pool
                    </button>
                </form>
            )}

            {viewerId && isRealUser && !isFreeAgent && (
                <form
                    action={joinAsFreeAgentFromForm.bind(null, eventId)}
                    className="space-y-2"
                >
                    <label className="block">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted">
                            Notes (optional)
                        </span>
                        <textarea
                            name="notes"
                            rows={2}
                            maxLength={280}
                            placeholder="e.g. setter, can play Sat morning"
                            className="mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                        />
                    </label>
                    <button
                        type="submit"
                        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                        Sign up as free agent
                    </button>
                </form>
            )}
        </section>
    );
}
