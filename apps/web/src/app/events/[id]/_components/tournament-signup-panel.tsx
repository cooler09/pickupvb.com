import Link from 'next/link';
import { FORMAT_LABEL } from '@/lib/enum-labels';
import { SubmitButton } from '@/components/submit-button';
import { registerTeamFromForm, withdrawTeamFromForm } from '../team-signup-actions';

export type RegisteredTeam = {
  teamId: string;
  slug: string;
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
  registered: { tone: 'success', text: 'Your team is registered.' },
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
    <section className="border-border-base space-y-4 rounded-lg border p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-fg text-lg font-semibold">Tournament teams</h2>
          <p className="text-muted text-sm">
            {eventFormat
              ? `Sign up your ${FORMAT_LABEL[eventFormat] ?? eventFormat} team to compete.`
              : 'Sign up your team to compete.'}
          </p>
        </div>
        <Link href="/teams" className="text-primary text-sm hover:underline">
          Manage your teams
        </Link>
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
          Registered ({teams.length})
        </h3>
        {teams.length === 0 ? (
          <p className="border-border-base text-muted rounded-md border border-dashed p-4 text-center text-sm">
            No teams registered yet — be the first.
          </p>
        ) : (
          <ul className="space-y-2">
            {teams.map((t) => {
              const viewerIsCaptain = viewerId !== null && t.captainId === viewerId;
              return (
                <li
                  key={t.teamId}
                  className="border-border-base bg-surface flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/teams/${t.slug}`}
                      className="truncate text-sm font-semibold hover:underline"
                    >
                      {t.name}
                    </Link>
                    <p className="text-muted text-xs">
                      Captain: {t.captain?.displayName ?? 'Unknown'} · {t.memberCount} player
                      {t.memberCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  {viewerIsCaptain && (
                    <form action={withdrawTeamFromForm.bind(null, eventId, t.teamId, returnPath)}>
                      <SubmitButton className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
                        Withdraw
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
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
          to register a team.
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
          to register a team.
        </p>
      )}

      {viewerId && isRealUser && (
        <div className="space-y-2">
          <h3 className="text-muted text-sm font-semibold tracking-wide uppercase">
            Register your team
          </h3>
          {registeredByViewer.length > 0 && (
            <p className="text-muted text-xs">
              Already registered: {registeredByViewer.map((t) => t.name).join(', ')}.
            </p>
          )}
          {eligibleTeams.length === 0 ? (
            <p className="border-border-base text-muted rounded-md border border-dashed p-3 text-sm">
              You don&apos;t captain a{' '}
              {eventFormat ? (FORMAT_LABEL[eventFormat] ?? eventFormat) : 'matching'} team.{' '}
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
                className="border-border-base bg-surface min-w-[12rem] flex-1 rounded-md border px-3 py-2 text-sm"
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
              <SubmitButton className="bg-primary hover:bg-primary/90 rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Register team
              </SubmitButton>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
