import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { rsvpBannerFor, RSVP_BANNER_CLASS } from '@/lib/event-rsvp-flash';
import { startTeamRegistrationCheckout } from '../team-checkout-actions';
import {
  addAdHocTeamMemberFromForm,
  registerAdHocTeamFromForm,
  removeAdHocTeamMemberFromForm,
  renameAdHocTeamFromForm,
  withdrawAdHocTeamFromForm,
} from '../ad-hoc-team-actions';

/**
 * One roster slot on an ad-hoc team registration.
 */
export type AdHocTeamMember = {
  id: string;
  userId: string | null;
  displayName: string | null;
  email: string | null;
  sortOrder: number;
};

/**
 * Captain-owned registration. Contains everything needed for editing
 * (members, payment status, name).
 */
export type AdHocTeamRegistration = {
  id: string;
  name: string;
  divisionId: string;
  paymentStatus: 'none' | 'pending' | 'paid' | 'refunded';
  members: ReadonlyArray<AdHocTeamMember>;
};

/**
 * Public-facing summary for the "Teams registered" list. Captain + members
 * are masked — only the team name, division, payment status and roster
 * size are shown.
 */
export type AdHocTeamPublicEntry = {
  id: string;
  name: string;
  divisionId: string;
  paymentStatus: 'none' | 'pending' | 'paid' | 'refunded';
  memberCount: number;
  isViewerCaptain: boolean;
};

type DivisionForRegistration = {
  id: string;
  label: string;
  priceCents: number | null;
  priceUnit: 'per_player' | 'per_team';
  teamSize: number | null;
};

type Props = {
  eventId: string;
  returnPath: string;
  divisions: ReadonlyArray<DivisionForRegistration>;
  viewerId: string | null;
  isRealUser: boolean;
  /** Registrations the viewer captains on this event. */
  viewerRegistrations: ReadonlyArray<AdHocTeamRegistration>;
  /** All ad-hoc registrations on this event, for the public list. */
  allRegistrations: ReadonlyArray<AdHocTeamPublicEntry>;
  /**
   * True when the host can't (or won't) collect payment via Stripe —
   * either `events.payments_off_platform` is set or the host has no
   * charges-enabled Stripe Connect account. Suppresses the captain Pay
   * button so we don't surface a CTA that would fail at checkout.
   */
  paymentsOffPlatform?: boolean;
  /** `?rsvp=` flash code. */
  resultCode?: string | undefined;
  /** Optional `?rsvp_msg=` echo. */
  resultMsg?: string | undefined;
};

function formatUsd(cents: number | null): string {
  if (cents === null) return 'TBD';
  return `$${(cents / 100).toFixed(2)}`;
}

const PAYMENT_PILL: Record<AdHocTeamRegistration['paymentStatus'], { label: string; cls: string }> =
  {
    none: { label: 'Unpaid', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    pending: { label: 'Pending', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    paid: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    refunded: { label: 'Refunded', cls: 'border-border-base bg-fg/5 text-muted' },
  };

function divisionLabel(
  divisions: ReadonlyArray<DivisionForRegistration>,
  divisionId: string,
): string {
  return divisions.find((d) => d.id === divisionId)?.label ?? 'Division';
}

function divisionPrice(
  divisions: ReadonlyArray<DivisionForRegistration>,
  divisionId: string,
): number | null {
  return divisions.find((d) => d.id === divisionId)?.priceCents ?? null;
}

function divisionUnitSuffix(
  divisions: ReadonlyArray<DivisionForRegistration>,
  divisionId: string,
): string {
  const unit = divisions.find((d) => d.id === divisionId)?.priceUnit;
  if (unit === 'per_team') return ' per team';
  if (unit === 'per_player') return ' per player';
  return '';
}

export function AdHocTeamSignupPanel({
  eventId,
  returnPath,
  divisions,
  viewerId,
  isRealUser,
  viewerRegistrations,
  allRegistrations,
  paymentsOffPlatform = false,
  resultCode,
  resultMsg,
}: Props) {
  const banner = rsvpBannerFor(resultCode, resultMsg);
  // Ad-hoc tournaments: every division is registerable as a team — the
  // captain assembles the roster regardless of price unit. `per_player`
  // just changes who pays at checkout time; it does not change the
  // registration shape (cf. ADR 0007).
  const perTeamDivisions = divisions;
  const hasRegisterable = perTeamDivisions.length > 0;

  return (
    <section className="border-border-base space-y-4 rounded-lg border p-4">
      <header>
        <h2 className="text-fg text-lg font-semibold">Register a team</h2>
        <p className="text-muted text-sm">
          Build a team for this tournament. The captain pays the team entry fee.
        </p>
      </header>

      {banner && (
        <div
          role={banner.tone === 'success' ? 'status' : 'alert'}
          className={RSVP_BANNER_CLASS[banner.tone]}
        >
          {banner.text}
        </div>
      )}

      {/* Public list of registered teams */}
      <div className="space-y-2">
        <h3 className="text-muted text-sm font-semibold tracking-wide uppercase">
          Registered ({allRegistrations.length})
        </h3>
        {allRegistrations.length === 0 ? (
          <p className="border-border-base text-muted rounded-md border border-dashed p-4 text-center text-sm">
            No teams registered yet — be the first.
          </p>
        ) : (
          <ul className="space-y-2">
            {allRegistrations.map((t) => (
              <li
                key={t.id}
                className="border-border-base bg-surface flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t.name}</p>
                  <p className="text-muted text-xs">
                    {divisionLabel(divisions, t.divisionId)} · {t.memberCount} player
                    {t.memberCount === 1 ? '' : 's'}
                    {t.isViewerCaptain ? ' · captain: you' : ''}
                  </p>
                </div>
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-medium ${PAYMENT_PILL[t.paymentStatus].cls}`}
                >
                  {PAYMENT_PILL[t.paymentStatus].label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Captain's own registrations: edit + pay */}
      {viewerRegistrations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-muted text-sm font-semibold tracking-wide uppercase">Your teams</h3>
          {viewerRegistrations.map((reg) => (
            <CaptainRegistrationCard
              key={reg.id}
              eventId={eventId}
              returnPath={returnPath}
              registration={reg}
              divisions={divisions}
              paymentsOffPlatform={paymentsOffPlatform}
            />
          ))}
        </div>
      )}

      {/* Login / claim prompts */}
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

      {/* New team form (captain only) */}
      {viewerId && isRealUser && hasRegisterable && (
        <NewTeamForm eventId={eventId} returnPath={returnPath} divisions={perTeamDivisions} />
      )}

      {viewerId && isRealUser && !hasRegisterable && (
        <p className="border-border-base text-muted rounded-md border border-dashed p-3 text-sm">
          No per-team divisions on this event. Players register individually.
        </p>
      )}
    </section>
  );
}

function NewTeamForm({
  eventId,
  returnPath,
  divisions,
}: {
  eventId: string;
  returnPath: string;
  divisions: ReadonlyArray<DivisionForRegistration>;
}) {
  // Default # of member rows: largest division teamSize - 1 (captain
  // implicitly fills slot 1 via the team name; the rest are added with
  // displayName/email). Players can be added/removed after creation.
  const maxTeamSize = Math.max(...divisions.map((d) => d.teamSize ?? 2));
  const rows = Math.max(1, maxTeamSize - 1);

  return (
    <form
      action={registerAdHocTeamFromForm.bind(null, eventId, returnPath)}
      className="border-border-base space-y-3 rounded-md border p-3"
    >
      <h3 className="text-muted text-sm font-semibold tracking-wide uppercase">Build a new team</h3>

      <label className="block">
        <span className="text-fg mb-1 block text-sm font-medium">Division</span>
        <select
          name="division_id"
          required
          defaultValue={divisions.length === 1 ? divisions[0]!.id : ''}
          className="border-border-base bg-surface w-full rounded-md border px-3 py-2 text-sm"
        >
          {divisions.length > 1 && (
            <option value="" disabled>
              Pick a division…
            </option>
          )}
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} — {formatUsd(d.priceCents)} per team
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-fg mb-1 block text-sm font-medium">Team name</span>
        <input
          name="team_name"
          required
          maxLength={120}
          placeholder="e.g. The Spike Squad"
          className="border-border-base bg-surface w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-fg text-sm font-medium">Roster (optional)</legend>
        <p className="text-muted text-xs">
          Add teammates now or after you create the team. You count as captain.
        </p>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-2">
            <input
              name={`member_${i}_name`}
              placeholder={`Player ${i + 2} name`}
              maxLength={120}
              className="border-border-base bg-surface rounded-md border px-3 py-2 text-sm"
            />
            <input
              name={`member_${i}_email`}
              type="email"
              placeholder="email (optional)"
              maxLength={200}
              className="border-border-base bg-surface rounded-md border px-3 py-2 text-sm"
            />
          </div>
        ))}
      </fieldset>

      <SubmitButton className="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        Register team
      </SubmitButton>
    </form>
  );
}

function CaptainRegistrationCard({
  eventId,
  returnPath,
  registration,
  divisions,
  paymentsOffPlatform,
}: {
  eventId: string;
  returnPath: string;
  registration: AdHocTeamRegistration;
  divisions: ReadonlyArray<DivisionForRegistration>;
  paymentsOffPlatform: boolean;
}) {
  const isPaid = registration.paymentStatus === 'paid';
  const isPending = registration.paymentStatus === 'pending';
  const priceCents = divisionPrice(divisions, registration.divisionId);
  const unitSuffix = divisionUnitSuffix(divisions, registration.divisionId);
  const pill = PAYMENT_PILL[registration.paymentStatus];

  return (
    <div className="border-border-base bg-surface space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-fg text-base font-semibold">{registration.name}</p>
          <p className="text-muted text-xs">
            {divisionLabel(divisions, registration.divisionId)} · {registration.members.length + 1}{' '}
            player
            {registration.members.length + 1 === 1 ? '' : 's'}
          </p>
        </div>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${pill.cls}`}>
          {pill.label}
        </span>
      </div>

      {/* Rename (only when unpaid) */}
      {!isPaid && (
        <form
          action={renameAdHocTeamFromForm.bind(null, eventId, registration.id, returnPath)}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            name="team_name"
            defaultValue={registration.name}
            required
            maxLength={120}
            className="border-border-base bg-surface flex-1 rounded-md border px-3 py-1.5 text-sm"
          />
          <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            Rename
          </SubmitButton>
        </form>
      )}

      {/* Roster */}
      <div className="space-y-2">
        <h4 className="text-muted text-xs font-semibold tracking-wide uppercase">Roster</h4>
        <ul className="space-y-1">
          <li className="text-fg text-sm">You (captain)</li>
          {registration.members.map((m) => (
            <li
              key={m.id}
              className="border-border-base flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate">
                {m.displayName ?? m.email ?? 'Player'}
                {m.email && m.displayName ? (
                  <span className="text-muted ml-2 text-xs">{m.email}</span>
                ) : null}
              </span>
              {!isPaid && (
                <form
                  action={removeAdHocTeamMemberFromForm.bind(
                    null,
                    eventId,
                    registration.id,
                    m.id,
                    returnPath,
                  )}
                >
                  <SubmitButton className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
                    Remove
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>

        {!isPaid && (
          <form
            action={addAdHocTeamMemberFromForm.bind(null, eventId, registration.id, returnPath)}
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          >
            <input
              name="member_name"
              placeholder="Name"
              maxLength={120}
              className="border-border-base bg-surface rounded-md border px-3 py-1.5 text-sm"
            />
            <input
              name="member_email"
              type="email"
              placeholder="email (optional)"
              maxLength={200}
              className="border-border-base bg-surface rounded-md border px-3 py-1.5 text-sm"
            />
            <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
              Add player
            </SubmitButton>
          </form>
        )}
      </div>

      {/* Pay / withdraw */}
      <div className="flex flex-wrap items-center gap-2">
        {!isPaid && !paymentsOffPlatform && priceCents !== null && priceCents > 0 && (
          <form action={startTeamRegistrationCheckout.bind(null, registration.id)}>
            <SubmitButton className="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {isPending ? 'Resume checkout' : `Pay — ${formatUsd(priceCents)}${unitSuffix}`}
            </SubmitButton>
          </form>
        )}
        {!isPaid && paymentsOffPlatform && priceCents !== null && priceCents > 0 && (
          <p className="text-muted text-xs">
            Pay the host {formatUsd(priceCents)}
            {unitSuffix} in person (cash, Venmo, etc.).
          </p>
        )}
        {!isPaid && (
          <form action={withdrawAdHocTeamFromForm.bind(null, eventId, registration.id, returnPath)}>
            <SubmitButton className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
              Withdraw team
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
