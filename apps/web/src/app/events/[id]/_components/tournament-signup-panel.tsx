import Link from 'next/link';
import { primaryButtonClass } from '@/components/primary-button';
import { SubmitButton } from '@/components/submit-button';
import { Alert } from '@/components/alert';
import { registerTeamFromForm, withdrawTeamFromForm } from '../team-signup-actions';
import { startRosterTeamCheckout } from '../roster-team-checkout-actions';

export type RegisteredTeam = {
  teamId: string;
  slug: string;
  name: string;
  captainId: string;
  captain: { displayName: string } | null;
  memberCount: number;
  /** Division the team is registered for (used to derive per-team price). */
  divisionId: string | null;
  /** Sidecar payment state when the team owes a per-team fee (ADR 0007). */
  payment: {
    status: 'none' | 'pending' | 'paid' | 'refunded';
    amountPaidCents: number | null;
  } | null;
};

export type EligibleTeam = {
  id: string;
  name: string;
  memberCount: number;
  isRegistered: boolean;
};

export type SignupDivision = {
  id: string;
  label: string;
  format: string | null;
  /** Per-team price in cents (null/0 ⇒ free). Drives the captain Pay button. */
  priceCents?: number | null;
  /** 'per_team' enables the captain checkout flow. */
  priceUnit?: string | null;
};

type Props = {
  eventId: string;
  teams: ReadonlyArray<RegisteredTeam>;
  viewerCaptainedTeams: ReadonlyArray<EligibleTeam>;
  /** Divisions on this event — required so the captain can pick where to register. */
  divisions: ReadonlyArray<SignupDivision>;
  viewerId: string | null;
  isRealUser: boolean;
  returnPath: string;
  /** True when host has opted into off-platform payment collection. */
  paymentsOffPlatform?: boolean;
  /** Result code from the server action, surfaced via `?team=` query param. */
  resultCode?: string | undefined;
  /**
   * Section heading / subheading overrides. Default to the tournament copy;
   * leagues pass season-oriented wording. The registration mechanics are
   * identical (roster team → division), so only the framing differs.
   */
  heading?: string;
  subheading?: string;
};

const RESULT_MESSAGES: Record<string, { tone: 'success' | 'error'; text: string }> = {
  registered: { tone: 'success', text: 'Your team is registered.' },
  withdrawn: { tone: 'success', text: 'Team withdrawn from this event.' },
  already: { tone: 'error', text: 'That team is already registered.' },
  forbidden: { tone: 'error', text: 'Only the team captain can do that.' },
  closed: { tone: 'error', text: "This event isn't open for signups." },
  missing: { tone: 'error', text: 'Team not found.' },
  division_required: { tone: 'error', text: 'Pick a division to continue.' },
  division_missing: { tone: 'error', text: 'Division not found on this event.' },
  team_paid: { tone: 'success', text: 'Team entry paid — you’re all set.' },
  team_pending: { tone: 'success', text: 'Payment processing — refresh in a moment.' },
  team_cancelled: { tone: 'error', text: 'Checkout cancelled. You can retry anytime.' },
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function TournamentSignupPanel({
  eventId,
  teams,
  viewerCaptainedTeams,
  divisions,
  viewerId,
  isRealUser,
  returnPath,
  paymentsOffPlatform = false,
  resultCode,
  heading,
  subheading,
}: Props) {
  const eligibleTeams = viewerCaptainedTeams.filter((t) => !t.isRegistered);
  const registeredByViewer = viewerCaptainedTeams.filter((t) => t.isRegistered);
  const result = resultCode ? RESULT_MESSAGES[resultCode] : undefined;
  const divisionById = new Map(divisions.map((d) => [d.id, d] as const));

  return (
    <section className="border-border-base rounded-shape-sm space-y-4 border p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-fg text-lg font-semibold">{heading ?? 'Tournament teams'}</h2>
          <p className="text-muted text-sm">
            {subheading ?? 'Sign up any team you captain — any format works.'}
          </p>
        </div>
        <Link href="/teams" className="text-primary text-sm hover:underline">
          Manage your teams
        </Link>
      </header>

      {result && (
        <Alert variant={result.tone === 'success' ? 'success' : 'error'}>{result.text}</Alert>
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
              const division = t.divisionId ? divisionById.get(t.divisionId) : undefined;
              const priceCents = division?.priceCents ?? 0;
              const owesPayment =
                viewerIsCaptain &&
                !paymentsOffPlatform &&
                division?.priceUnit === 'per_team' &&
                priceCents > 0;
              const paymentStatus = t.payment?.status ?? 'none';
              const isPaid = paymentStatus === 'paid';
              const isPending = paymentStatus === 'pending';
              const isRefunded = paymentStatus === 'refunded';
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
                      {owesPayment && isPaid && <span className="text-emerald-700"> · Paid</span>}
                      {owesPayment && isPending && (
                        <span className="text-amber-700"> · Payment pending</span>
                      )}
                      {owesPayment && isRefunded && (
                        <span className="text-red-700"> · Refunded</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {owesPayment && !isPaid && !isRefunded && (
                      <form action={startRosterTeamCheckout.bind(null, eventId, t.teamId)}>
                        <SubmitButton className={primaryButtonClass('sm')}>
                          {isPending ? 'Resume checkout' : `Pay — ${formatUsd(priceCents)}`}
                        </SubmitButton>
                      </form>
                    )}
                    {viewerIsCaptain && (
                      <form action={withdrawTeamFromForm.bind(null, eventId, t.teamId, returnPath)}>
                        <SubmitButton className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
                          Withdraw
                        </SubmitButton>
                      </form>
                    )}
                  </div>
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
              You don&apos;t captain any teams yet.{' '}
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
              {divisions.length === 1 ? (
                <input type="hidden" name="division_id" value={divisions[0]!.id} />
              ) : (
                <select
                  name="division_id"
                  required
                  defaultValue=""
                  className="border-border-base bg-surface min-w-[10rem] flex-1 rounded-md border px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Pick a division…
                  </option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              )}
              <SubmitButton className={primaryButtonClass('md')}>Register team</SubmitButton>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
