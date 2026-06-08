import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { joinAsFreeAgentFromForm, leaveAsFreeAgent, pickUpFreeAgent } from '../free-agent-actions';

export type FreeAgentEntry = {
  userId: string;
  notes: string | null;
  divisionId: string | null;
  profile: { displayName: string; avatarUrl: string | null };
};

export type FreeAgentDivision = {
  id: string;
  label: string;
  /** Whether this division accepts free-agent signups (R2). */
  allowFreeAgents: boolean;
};

type Props = {
  eventId: string;
  freeAgents: ReadonlyArray<FreeAgentEntry>;
  /** Divisions on this event. Always ≥ 1 for tournaments. */
  divisions: ReadonlyArray<FreeAgentDivision>;
  /** Is the viewer already signed up as a free agent? */
  isFreeAgent: boolean;
  viewerId: string | null;
  isRealUser: boolean;
  /** True when the viewer captains a team registered in this event — gates the
   * per-row "Pick up" button (the action re-checks the division server-side). */
  viewerCanPickUp: boolean;
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
  division_required: { tone: 'error', text: 'Pick a division to sign up for.' },
  fa_disabled: {
    tone: 'error',
    text: "This division isn't accepting free agents.",
  },
  signin: { tone: 'error', text: 'Log in to sign up.' },
  anon: { tone: 'error', text: 'Finish creating your account to sign up.' },
  // Pickup outcomes (ADR-less free-agent pickup)
  picked_up: {
    tone: 'success',
    text: 'Picked up! They have a pending invite to your team and are off the free-agent pool.',
  },
  fa_no_team: {
    tone: 'error',
    text: 'Register a team in that division before picking up a free agent.',
  },
  fa_already_member: { tone: 'error', text: 'That player is already on your roster.' },
  forbidden: { tone: 'error', text: 'Only the team captain can pick up free agents.' },
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
  divisions,
  isFreeAgent,
  viewerId,
  isRealUser,
  viewerCanPickUp,
  returnPath,
  resultCode,
}: Props) {
  const result = resultCode ? RESULT_MESSAGES[resultCode] : undefined;
  // A captain may pick up any agent that isn't themselves and has a division
  // (legacy null-division rows can't be matched to a roster team).
  const pickupFor = (f: FreeAgentEntry): boolean =>
    viewerCanPickUp && !!f.divisionId && f.userId !== viewerId;
  // Only divisions that opted in can accept new signups. The grouping list
  // above still shows agents that previously signed up for now-opted-out
  // divisions; they're surfaced under their original bracket so captains
  // can still see them.
  const signupDivisions = divisions.filter((d) => d.allowFreeAgents);

  return (
    <section className="border-border-base rounded-shape-sm space-y-4 border p-4">
      <header>
        <h2 className="text-fg text-lg font-semibold">Free agents</h2>
        <p className="text-muted text-sm">
          Don&apos;t have a team? Sign up here so a captain can pick you up.
        </p>
      </header>

      {result && (
        <Alert variant={result.tone === 'success' ? 'success' : 'error'}>{result.text}</Alert>
      )}

      <div className="space-y-4">
        <h3 className="text-muted text-sm font-semibold tracking-wide uppercase">
          Available ({freeAgents.length})
        </h3>
        {freeAgents.length === 0 ? (
          <p className="border-border-base text-muted rounded-md border border-dashed p-4 text-center text-sm">
            No free agents yet.
          </p>
        ) : divisions.length > 1 ? (
          // Multi-division events: group free agents by division so captains
          // scanning for a roster slot can see who's available in their bracket
          // at a glance. Empty divisions are still rendered (so captains know
          // nobody has signed up for that bracket yet); free agents with a
          // legacy null `division_id` (pre-Bundle 5) fall into "Unassigned".
          groupFreeAgentsByDivision(freeAgents, divisions).map((group) => (
            <div key={group.key} className="space-y-2">
              <h4 className="text-fg text-xs font-semibold">
                {group.label}{' '}
                <span className="text-muted font-normal">({group.agents.length})</span>
              </h4>
              {group.agents.length === 0 ? (
                <p className="border-border-base text-muted rounded-md border border-dashed p-3 text-center text-xs">
                  No free agents in this division yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {group.agents.map((f) => (
                    <FreeAgentRow
                      key={f.userId}
                      agent={f}
                      eventId={eventId}
                      canPickUp={pickupFor(f)}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))
        ) : (
          <ul className="space-y-2">
            {freeAgents.map((f) => (
              <FreeAgentRow key={f.userId} agent={f} eventId={eventId} canPickUp={pickupFor(f)} />
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
          <SubmitButton className="text-md-error text-xs font-medium hover:underline disabled:opacity-50">
            Remove me from the free-agent pool
          </SubmitButton>
        </form>
      )}

      {viewerId && isRealUser && !isFreeAgent && signupDivisions.length > 0 && (
        <form action={joinAsFreeAgentFromForm.bind(null, eventId)} className="space-y-2">
          {signupDivisions.length === 1 ? (
            <input type="hidden" name="division_id" value={signupDivisions[0]!.id} />
          ) : (
            <label className="block">
              <span className="text-muted text-xs font-medium tracking-wide uppercase">
                Division
              </span>
              <select
                name="division_id"
                required
                defaultValue=""
                className="border-border-base bg-md-surface-container mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Pick a division…
                </option>
                {signupDivisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-muted text-xs font-medium tracking-wide uppercase">
              Notes (optional)
            </span>
            <textarea
              name="notes"
              rows={2}
              maxLength={280}
              placeholder="e.g. setter, can play Sat morning"
              className="border-border-base bg-md-surface-container mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <SubmitButton className={primaryButtonClass('md')}>Sign up as free agent</SubmitButton>
        </form>
      )}
    </section>
  );
}

function FreeAgentRow({
  agent,
  eventId,
  canPickUp,
}: {
  agent: FreeAgentEntry;
  eventId: string;
  canPickUp: boolean;
}) {
  return (
    <li className="border-border-base bg-md-surface-container flex items-start justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <p className="text-fg text-sm font-semibold">{agent.profile.displayName}</p>
        {agent.notes && <p className="text-muted mt-1 text-xs">{agent.notes}</p>}
      </div>
      {canPickUp && agent.divisionId && (
        <form action={pickUpFreeAgent.bind(null, eventId, agent.divisionId, agent.userId)}>
          <SubmitButton className={`${neutralButtonClass('sm')} shrink-0`}>Pick up</SubmitButton>
        </form>
      )}
    </li>
  );
}

type FreeAgentGroup = {
  key: string;
  label: string;
  agents: ReadonlyArray<FreeAgentEntry>;
};

/**
 * Bucket free agents by `divisionId`, preserving division order. Empty
 * divisions are kept (so captains can see "nobody is in 6v6 open yet"
 * instead of inferring it from absence). Agents with a null `divisionId`
 * — legacy rows from before Bundle 5 made the picker mandatory — fall
 * into a trailing "Unassigned" group.
 */
function groupFreeAgentsByDivision(
  freeAgents: ReadonlyArray<FreeAgentEntry>,
  divisions: ReadonlyArray<FreeAgentDivision>,
): ReadonlyArray<FreeAgentGroup> {
  const byDivision = new Map<string, FreeAgentEntry[]>(divisions.map((d) => [d.id, []]));
  const unassigned: FreeAgentEntry[] = [];
  for (const agent of freeAgents) {
    const bucket = agent.divisionId ? byDivision.get(agent.divisionId) : undefined;
    if (bucket) bucket.push(agent);
    else unassigned.push(agent);
  }
  const groups: FreeAgentGroup[] = divisions.map((d) => ({
    key: d.id,
    label: d.label,
    agents: byDivision.get(d.id) ?? [],
  }));
  if (unassigned.length > 0) {
    groups.push({ key: '__unassigned', label: 'Unassigned', agents: unassigned });
  }
  return groups;
}
