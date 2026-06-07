'use client';

import { CloseOnSettled, FormModal, ModalFooter } from '@/components/form-modal';
import { primaryButtonClass } from '@/components/primary-button';
import { SubmitButton } from '@/components/submit-button';
import { UserPicker } from '@/components/user-picker';
import {
  assignTeamCaptainFromForm,
  hostForceWithdrawTeamRegistration,
  hostMarkTeamRegistrationPaid,
  hostRefundTeamRegistration,
} from '../host-team-registration-actions';
import { markWalkInPaidCashFromForm, registerWalkInTeamFromForm } from '../walk-in-team-actions';

/**
 * Host-facing row for the ad-hoc team management panel. Built from the
 * page's side-load — captain display name comes from a `profiles` join.
 */
export type HostAdHocTeamRowMember = {
  id: string;
  userId: string | null;
  displayName: string;
  email: string | null;
};

export type HostAdHocTeamRow = {
  id: string;
  name: string;
  divisionId: string;
  paymentStatus: 'none' | 'pending' | 'paid' | 'refunded';
  paymentIntentId: string | null;
  amountPaidCents: number;
  rosterSize: number;
  /** Who created this registration — ADR 0017. */
  source: 'ad_hoc' | 'walk_in';
  /** Phone for walk-in captains (null for captain/host sources). */
  captainPhone: string | null;
  /** Freeform note attached when the host marked a walk-in paid in cash. */
  paymentNote: string | null;
  captain: {
    id: string | null;
    displayName: string | null;
  } | null;
  /** Roster excluding the captain, sorted by `sort_order`. */
  members: ReadonlyArray<HostAdHocTeamRowMember>;
};

type DivisionLabel = {
  id: string;
  label: string;
  /**
   * Whether the host can add an account-less team to this division — ad-hoc
   * divisions (tournaments) or roster divisions (leagues), ADR 0033. Open-play
   * / individual (null-mode) divisions can't.
   */
  acceptsHostTeams: boolean;
};

type Props = {
  eventId: string;
  returnPath: string;
  divisions: ReadonlyArray<DivisionLabel>;
  rows: ReadonlyArray<HostAdHocTeamRow>;
};

const PAYMENT_PILL: Record<HostAdHocTeamRow['paymentStatus'], { label: string; cls: string }> = {
  none: {
    label: 'Unpaid',
    cls: 'border-md-warning/30 bg-md-warning-container text-md-on-warning-container',
  },
  pending: {
    label: 'Pending',
    cls: 'border-md-warning/30 bg-md-warning-container text-md-on-warning-container',
  },
  paid: {
    label: 'Paid',
    cls: 'border-md-success/30 bg-md-success-container text-md-on-success-container',
  },
  refunded: { label: 'Refunded', cls: 'border-border-base bg-fg/5 text-muted' },
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function divisionLabel(divisions: ReadonlyArray<DivisionLabel>, id: string): string {
  return divisions.find((d) => d.id === id)?.label ?? 'Division';
}

/**
 * Host management table for ad-hoc team registrations (ADR 0007).
 *
 * Shown inside the "Host tools" details on the event page when the event
 * is in `ad_hoc` team mode. Lets the host:
 *   - Mark a team paid (off-platform cash / Venmo)
 *   - Refund a paid team (Stripe call when applicable; otherwise just a
 *     state flip for off-platform receipts)
 *   - Force-withdraw an unpaid or already-refunded team
 *
 * All actions are bound via `.bind()` and posted as plain forms so the
 * action can `revalidatePath` + `redirect` with a flash code.
 */
export function HostAdHocTeamsPanel({ eventId, returnPath, divisions, rows }: Props) {
  const addableDivisions = divisions.filter((d) => d.acceptsHostTeams);
  return (
    <section className="border-border-base bg-fg/[0.02] rounded-shape-sm space-y-3 border p-4">
      <header>
        <h3 className="text-fg text-sm font-semibold">Team registrations</h3>
        <p className="text-muted text-xs">
          Add teams that registered another way (cash, Venmo, check, or in person), mark
          off-platform payments, refund Stripe payments, or remove unpaid teams.
        </p>
      </header>

      {addableDivisions.length > 0 && (
        <FormModal
          trigger={(open) => (
            <button type="button" onClick={open} className={primaryButtonClass('sm')}>
              + Add a team
            </button>
          )}
          title="Add a team"
          description="Add a team that registered off the platform (cash, Venmo, check) or in person. Captain and additional roster are optional — you can edit later."
          size="lg"
        >
          {(close) => (
            <form
              action={registerWalkInTeamFromForm.bind(null, eventId, returnPath)}
              className="space-y-3 text-sm"
            >
              <CloseOnSettled onSettled={close} />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-medium">Division</span>
                  <select
                    name="division_id"
                    required
                    className="border-border-base bg-md-surface-container rounded-md border px-2 py-1 text-sm"
                  >
                    {addableDivisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-medium">Team name</span>
                  <input
                    name="team_name"
                    required
                    maxLength={120}
                    className="border-border-base bg-md-surface-container rounded-md border px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-medium">Captain name</span>
                  <input
                    name="captain_display_name"
                    required
                    maxLength={80}
                    className="border-border-base bg-md-surface-container rounded-md border px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-medium">Captain phone (optional)</span>
                  <input
                    name="captain_phone"
                    maxLength={40}
                    inputMode="tel"
                    className="border-border-base bg-md-surface-container rounded-md border px-2 py-1 text-sm"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-muted text-xs font-medium">
                  Additional players (one per line, optional)
                </span>
                <textarea
                  name="members"
                  rows={3}
                  className="border-border-base bg-md-surface-container rounded-md border px-2 py-1 text-sm"
                />
              </label>
              <ModalFooter>
                <button
                  type="button"
                  onClick={close}
                  className="border-border-base text-fg/80 hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
                <SubmitButton pendingChildren="Adding…" className={primaryButtonClass('sm')}>
                  Add team
                </SubmitButton>
              </ModalFooter>
            </form>
          )}
        </FormModal>
      )}
      {rows.length === 0 ? (
        <p className="text-muted text-xs">No teams have registered yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const pill = PAYMENT_PILL[r.paymentStatus];
            const isPaid = r.paymentStatus === 'paid';
            const isRefunded = r.paymentStatus === 'refunded';
            const isStripe = !!r.paymentIntentId && !r.paymentIntentId.startsWith('offline:');
            const isWalkIn = r.source === 'walk_in';
            const canMarkPaid = r.paymentStatus === 'none' || r.paymentStatus === 'pending';
            const canRefund = isPaid;
            const canForceWithdraw = r.paymentStatus === 'none' || isRefunded;
            return (
              <li
                key={r.id}
                className="border-border-base bg-md-surface-container space-y-2 rounded-md border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-fg truncate text-sm font-semibold">{r.name}</p>
                    <p className="text-muted text-xs">
                      {divisionLabel(divisions, r.divisionId)} · {r.rosterSize} player
                      {r.rosterSize === 1 ? '' : 's'} · Captain:{' '}
                      {r.captain?.displayName ?? 'Unknown'}
                    </p>
                    {isWalkIn && r.captainPhone && (
                      <p className="text-muted text-xs">Phone: {r.captainPhone}</p>
                    )}
                    {isPaid && r.paymentNote && (
                      <p className="text-muted text-xs italic">Note: {r.paymentNote}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {isWalkIn && (
                      <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                        Added by host
                      </span>
                    )}
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium ${pill.cls}`}
                    >
                      {pill.label}
                      {isPaid && r.amountPaidCents > 0
                        ? ` · ${formatUsd(r.amountPaidCents)}${isStripe ? ' (Stripe)' : isWalkIn ? ' (cash)' : ' (off-platform)'}`
                        : ''}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canMarkPaid && !isWalkIn && (
                    <form
                      action={hostMarkTeamRegistrationPaid.bind(null, eventId, r.id, returnPath)}
                    >
                      <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50">
                        Mark paid (off-platform)
                      </SubmitButton>
                    </form>
                  )}
                  {canMarkPaid && isWalkIn && (
                    <form
                      action={markWalkInPaidCashFromForm.bind(null, eventId, r.id, returnPath)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="text"
                        name="note"
                        placeholder="Cash note (optional)"
                        maxLength={500}
                        className="border-border-base bg-md-surface-container rounded-md border px-2 py-1 text-xs"
                      />
                      <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50">
                        Mark paid (cash)
                      </SubmitButton>
                    </form>
                  )}
                  {isWalkIn && (
                    <FormModal
                      trigger={(open) => (
                        <button
                          type="button"
                          onClick={open}
                          className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1 text-xs font-medium"
                        >
                          Assign captain
                        </button>
                      )}
                      title="Assign captain"
                      description="Link this team to a registered player's account. They'll be able to manage the roster, pay, and report league scores."
                      size="lg"
                    >
                      {(close) => (
                        <form
                          action={assignTeamCaptainFromForm.bind(null, eventId, r.id, returnPath)}
                          className="space-y-3 text-sm"
                        >
                          <CloseOnSettled onSettled={close} />
                          <UserPicker
                            name="captain_user_id"
                            label="Captain"
                            placeholder="Search players by name…"
                            required
                            helperText="The player must already have a PickupVB account."
                          />
                          <ModalFooter>
                            <button
                              type="button"
                              onClick={close}
                              className="border-border-base text-fg/80 hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
                            >
                              Cancel
                            </button>
                            <SubmitButton
                              pendingChildren="Assigning…"
                              className={primaryButtonClass('sm')}
                            >
                              Assign captain
                            </SubmitButton>
                          </ModalFooter>
                        </form>
                      )}
                    </FormModal>
                  )}
                  {canRefund && (
                    <form action={hostRefundTeamRegistration.bind(null, eventId, r.id, returnPath)}>
                      <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50">
                        {isStripe ? 'Refund via Stripe' : 'Mark refunded'}
                      </SubmitButton>
                    </form>
                  )}
                  {canForceWithdraw && (
                    <form
                      action={hostForceWithdrawTeamRegistration.bind(
                        null,
                        eventId,
                        r.id,
                        returnPath,
                      )}
                    >
                      <SubmitButton className="border-md-error/40 text-md-error hover:bg-md-error/10 rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50">
                        Remove team
                      </SubmitButton>
                    </form>
                  )}
                </div>

                <details className="group">
                  <summary className="text-muted hover:text-fg cursor-pointer text-xs font-medium select-none">
                    <span className="group-open:hidden">Show roster ({r.rosterSize})</span>
                    <span className="hidden group-open:inline">Hide roster</span>
                  </summary>
                  <ul className="border-border-base mt-2 space-y-1 border-l pl-3 text-sm">
                    <li className="text-fg flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{r.captain?.displayName ?? 'Captain'}</span>
                      <span className="text-muted text-xs">(captain)</span>
                    </li>
                    {r.members.map((m) => (
                      <li key={m.id} className="text-fg flex flex-wrap items-baseline gap-x-2">
                        <span className="truncate">{m.displayName}</span>
                        {m.email && m.email !== m.displayName && (
                          <span className="text-muted truncate text-xs">{m.email}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
