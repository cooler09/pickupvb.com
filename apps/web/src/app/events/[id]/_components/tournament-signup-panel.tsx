import Link from 'next/link';
import { FORMAT_LABEL } from '@/lib/enum-labels';
import {
    registerTeamFromForm,
    withdrawTeamFromForm,
} from '../team-signup-actions';

export type RegisteredTeam = {
    teamId: string;
    name: string;
    format: string;
    captainId: string;
    captain: { displayName: string } | null;
    memberCount: number;
};

export type EligibleTeam = {
    id: string;
    name: string;
    format: string;
    memberCount: number;
    isRegistered: boolean;
};

type Props = {
    eventId: string;
    eventFormat: string | null;
    teams: ReadonlyArray<RegisteredTeam>;
    viewerCaptainedTeams: ReadonlyArray<EligibleTeam>;
    viewerId: string | null;
    isRealUser: boolean;
    returnPath: string;
    /** Result code from the server action, surfaced via `?team=` query param. */
    resultCode?: string | undefined;
};

const RESULT_MESSAGES: Record<string, { tone: 'success' | 'error'; text: string }> = {
    registered: { tone: 'success', text: "Your team is registered." },
    withdrawn: { tone: 'success', text: 'Team withdrawn from this tournament.' },
    already: { tone: 'error', text: 'That team is already registered.' },
    forbidden: { tone: 'error', text: 'Only the team captain can do that.' },
    closed: { tone: 'error', text: "This event isn't open for signups." },
    missing: { tone: 'error', text: 'Team not found.' },
    invalid: { tone: 'error', text: "Team format doesn't match the event." },
};

export function TournamentSignupPanel({
    eventId,
    eventFormat,
    teams,
    viewerCaptainedTeams,
    viewerId,
    isRealUser,
    returnPath,
    resultCode,
}: Props) {
    const eligibleTeams = viewerCaptainedTeams.filter((t) => !t.isRegistered);
    const registeredByViewer = viewerCaptainedTeams.filter((t) => t.isRegistered);
    const result = resultCode ? RESULT_MESSAGES[resultCode] : undefined;

    return (
        <section className="space-y-4 rounded-lg border border-border-base p-4">
            <header className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h2 className="text-lg font-semibold text-fg">Tournament teams</h2>
                    <p className="text-sm text-muted">
                        {eventFormat
                            ? `Sign up your ${FORMAT_LABEL[eventFormat] ?? eventFormat} team to compete.`
                            : 'Sign up your team to compete.'}
                    </p>
                </div>
                <Link href="/teams" className="text-sm text-primary hover:underline">
                    Manage your teams
                </Link>
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
                    Registered ({teams.length})
                </h3>
                {teams.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border-base p-4 text-center text-sm text-muted">
                        No teams registered yet — be the first.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {teams.map((t) => {
                            const viewerIsCaptain =
                                viewerId !== null && t.captainId === viewerId;
                            return (
                                <li
                                    key={t.teamId}
                                    className="flex items-center justify-between gap-3 rounded-md border border-border-base bg-surface p-3"
                                >
                                    <div className="min-w-0">
                                        <Link
                                            href={`/teams/${t.teamId}`}
                                            className="truncate text-sm font-semibold hover:underline"
                                        >
                                            {t.name}
                                        </Link>
                                        <p className="text-xs text-muted">
                                            Captain: {t.captain?.displayName ?? 'Unknown'} ·{' '}
                                            {t.memberCount} player
                                            {t.memberCount === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                    {viewerIsCaptain && (
                                        <form
                                            action={withdrawTeamFromForm.bind(
                                                null,
                                                eventId,
                                                t.teamId,
                                                returnPath,
                                            )}
                                        >
                                            <button
                                                type="submit"
                                                className="text-xs font-medium text-red-600 hover:underline"
                                            >
                                                Withdraw
                                            </button>
                                        </form>
                                    )}
                                </li>
                            );
                        })}
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
                    to register a team.
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
                    to register a team.
                </p>
            )}

            {viewerId && isRealUser && (
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                        Register your team
                    </h3>
                    {registeredByViewer.length > 0 && (
                        <p className="text-xs text-muted">
                            Already registered:{' '}
                            {registeredByViewer.map((t) => t.name).join(', ')}.
                        </p>
                    )}
                    {eligibleTeams.length === 0 ? (
                        <p className="rounded-md border border-dashed border-border-base p-3 text-sm text-muted">
                            You don&apos;t captain a{' '}
                            {eventFormat
                                ? FORMAT_LABEL[eventFormat] ?? eventFormat
                                : 'matching'}{' '}
                            team.{' '}
                            <Link href="/teams/new" className="text-primary underline">
                                Create one
                            </Link>
                            .
                        </p>
                    ) : (
                        <form
                            action={registerTeamFromForm.bind(null, eventId, returnPath)}
                            className="flex flex-wrap items-center gap-2"
                        >
                            <select
                                name="team_id"
                                required
                                defaultValue=""
                                className="flex-1 min-w-[12rem] rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                            >
                                <option value="" disabled>
                                    Pick a team…
                                </option>
                                {eligibleTeams.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name} ({t.memberCount} player
                                        {t.memberCount === 1 ? '' : 's'})
                                    </option>
                                ))}
                            </select>
                            <button
                                type="submit"
                                className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                            >
                                Register team
                            </button>
                        </form>
                    )}
                </div>
            )}
        </section>
    );
}
