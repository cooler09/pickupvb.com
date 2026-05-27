import type { Brand } from '../shared/brand.js';
import { AggregateRoot } from '../shared/aggregate-root.js';
import { InvariantViolation } from '../shared/result.js';
import type { DivisionId } from './division.js';
import type { UserId } from './volleyball-event.js';

export type EventTeamRegistrationId = Brand<string, 'EventTeamRegistrationId'>;
export type EventTeamRegistrationMemberId = Brand<string, 'EventTeamRegistrationMemberId'>;

/** Captain-checkout state for a per-team-priced division (ADR 0007). */
export const RegistrationPaymentStatus = {
  None: 'none',
  Pending: 'pending',
  Paid: 'paid',
  Refunded: 'refunded',
} as const;
export type RegistrationPaymentStatus =
  (typeof RegistrationPaymentStatus)[keyof typeof RegistrationPaymentStatus];

/**
 * Who created this registration (ADR 0017).
 *
 * - `'captain'` — captain self-signup via `AdHocTeamSignupPanel`. Requires
 *   a real account so `captainId` references `profiles(id)`.
 * - `'host'` — host registered an ad-hoc team on behalf of a real
 *   captain account (the captain delegated the form, or signed up at
 *   the table but is on-platform).
 * - `'walk_in'` — host registered a same-day team at the table for
 *   someone with no account. `captainId` is `null`; `captainDisplayName`
 *   carries the freeform identity. Walk-ins are only legal in `ad_hoc`
 *   divisions and start at `payment_status='none'` (cash at the table).
 */
export const RegistrationSource = {
  Captain: 'captain',
  Host: 'host',
  WalkIn: 'walk_in',
} as const;
export type RegistrationSource = (typeof RegistrationSource)[keyof typeof RegistrationSource];

/**
 * One roster slot on an {@link EventTeamRegistration}. A slot identifies its
 * player either by `userId` (existing account) or by `displayName` (+ optional
 * `email`) for guests the captain is bringing who don't have an account.
 *
 * At least one of `userId` / `displayName` must be present — enforced both
 * here and as a DB check constraint.
 */
export interface RegistrationMemberProps {
  id: EventTeamRegistrationMemberId;
  userId: UserId | null;
  displayName: string | null;
  email: string | null;
  sortOrder: number;
}

export class RegistrationMember {
  private constructor(
    public readonly id: EventTeamRegistrationMemberId,
    public readonly userId: UserId | null,
    public readonly displayName: string | null,
    public readonly email: string | null,
    public readonly sortOrder: number,
  ) {}

  /**
   * Validate and produce a single roster member. Throws
   * {@link InvariantViolation} when neither a linked user nor a display
   * name is supplied, when the display name / email lengths are out of
   * range, or when `sortOrder` is not a non-negative integer.
   */
  static create(props: RegistrationMemberProps): RegistrationMember {
    const displayName = props.displayName?.trim() || null;
    const email = props.email?.trim() || null;
    if (!props.userId && !displayName) {
      throw new InvariantViolation(
        'Each roster member must have either a linked user account or a display name.',
      );
    }
    if (displayName && (displayName.length < 1 || displayName.length > 80)) {
      throw new InvariantViolation('Member display name must be 1–80 characters.');
    }
    if (email && (email.length < 3 || email.length > 254)) {
      throw new InvariantViolation('Member email must be 3–254 characters.');
    }
    if (!Number.isInteger(props.sortOrder) || props.sortOrder < 0) {
      throw new InvariantViolation('Member sort order must be a non-negative integer.');
    }
    return new RegistrationMember(props.id, props.userId, displayName, email, props.sortOrder);
  }
}

export interface CreateEventTeamRegistrationProps {
  id: EventTeamRegistrationId;
  eventId: string;
  divisionId: DivisionId;
  /**
   * Required for `'captain'` and `'host'` sources; must be `null` for
   * `'walk_in'`. The factory validates the discriminant.
   */
  captainId: UserId | null;
  name: string;
  /** Roster does not include the captain implicitly — pass them as a member. */
  members: ReadonlyArray<RegistrationMember>;
  /**
   * Defaults to `'captain'` so existing self-signup call sites don't
   * have to change. Host walk-in flows pass `'walk_in'` explicitly
   * (and must also pass `captainDisplayName`).
   */
  source?: RegistrationSource;
  /**
   * Required when `source = 'walk_in'`. Optional otherwise (the captain's
   * profile display name is used for rendering on captain/host rows; this
   * freeform field is for walk-ins who don't have a profile).
   */
  captainDisplayName?: string | null;
  /** Optional contact number captured at the table for walk-ins. */
  captainPhone?: string | null;
}

export interface RehydrateEventTeamRegistrationProps extends CreateEventTeamRegistrationProps {
  source: RegistrationSource;
  paymentStatus: RegistrationPaymentStatus;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  amountPaidCents: number | null;
  paidAt: Date | null;
  paymentNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const MAX_NAME_LEN = 80;
const MAX_ROSTER_SIZE = 24;

/**
 * Aggregate root for an ad-hoc team registration (ADR 0007).
 *
 * Unlike the persistent {@link Team} aggregate, this team is event-scoped:
 * the captain assembles a roster for a specific event + division, and the
 * record does not appear in the captain's "my teams" list. It carries its
 * own per-team checkout state when the chosen division is priced
 * `per_team` on an on-platform event.
 *
 * Mutations: members can be added/removed before payment is captured.
 * Payment transitions are one-way except `Paid -> Refunded`.
 */
export class EventTeamRegistration extends AggregateRoot<EventTeamRegistrationId> {
  private constructor(
    id: EventTeamRegistrationId,
    public readonly eventId: string,
    public readonly divisionId: DivisionId,
    public readonly captainId: UserId | null,
    public readonly source: RegistrationSource,
    public readonly captainDisplayName: string | null,
    public readonly captainPhone: string | null,
    private _name: string,
    private _members: RegistrationMember[],
    private _paymentStatus: RegistrationPaymentStatus,
    private _checkoutSessionId: string | null,
    private _paymentIntentId: string | null,
    private _amountPaidCents: number | null,
    private _paidAt: Date | null,
    private _paymentNote: string | null,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {
    super(id);
  }

  /**
   * Validate inputs and produce a new `EventTeamRegistration` in payment
   * status `None`. Throws {@link InvariantViolation} when the name is
   * empty / too long, the roster exceeds {@link MAX_ROSTER_SIZE}, or a
   * member is duplicated (see `assertUniqueMembers`).
   */
  static create(props: CreateEventTeamRegistrationProps): EventTeamRegistration {
    const name = props.name.trim();
    if (!name) {
      throw new InvariantViolation('Team name is required.');
    }
    if (name.length > MAX_NAME_LEN) {
      throw new InvariantViolation(`Team name must be at most ${MAX_NAME_LEN} characters.`);
    }
    if (props.members.length > MAX_ROSTER_SIZE) {
      throw new InvariantViolation(`Roster may have at most ${MAX_ROSTER_SIZE} members.`);
    }
    assertUniqueMembers(props.members);
    const source = props.source ?? RegistrationSource.Captain;
    const displayName = props.captainDisplayName?.trim() || null;
    const phone = props.captainPhone?.trim() || null;
    assertSourceIdentity(source, props.captainId, displayName);
    if (displayName && displayName.length > MAX_NAME_LEN) {
      throw new InvariantViolation(
        `Captain display name must be at most ${MAX_NAME_LEN} characters.`,
      );
    }
    if (phone && (phone.length < 1 || phone.length > 40)) {
      throw new InvariantViolation('Captain phone must be 1–40 characters.');
    }
    const now = new Date();
    return new EventTeamRegistration(
      props.id,
      props.eventId,
      props.divisionId,
      props.captainId,
      source,
      displayName,
      phone,
      name,
      [...props.members],
      RegistrationPaymentStatus.None,
      null,
      null,
      null,
      null,
      null,
      now,
      now,
    );
  }

  /**
   * Rebuild an `EventTeamRegistration` from already-persisted state.
   * Skips the create-time invariants (name length, roster size, uniqueness)
   * — only call from repository adapters reading already-validated rows.
   */
  static rehydrate(props: RehydrateEventTeamRegistrationProps): EventTeamRegistration {
    return new EventTeamRegistration(
      props.id,
      props.eventId,
      props.divisionId,
      props.captainId,
      props.source,
      props.captainDisplayName ?? null,
      props.captainPhone ?? null,
      props.name,
      [...props.members],
      props.paymentStatus,
      props.checkoutSessionId,
      props.paymentIntentId,
      props.amountPaidCents,
      props.paidAt,
      props.paymentNote,
      props.createdAt,
      props.updatedAt,
    );
  }

  get name(): string {
    return this._name;
  }

  get members(): ReadonlyArray<RegistrationMember> {
    return this._members;
  }

  get rosterSize(): number {
    return this._members.length;
  }

  get paymentStatus(): RegistrationPaymentStatus {
    return this._paymentStatus;
  }

  get checkoutSessionId(): string | null {
    return this._checkoutSessionId;
  }

  get paymentIntentId(): string | null {
    return this._paymentIntentId;
  }

  get amountPaidCents(): number | null {
    return this._amountPaidCents;
  }

  get paidAt(): Date | null {
    return this._paidAt;
  }

  get paymentNote(): string | null {
    return this._paymentNote;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  rename(newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new InvariantViolation('Team name is required.');
    }
    if (trimmed.length > MAX_NAME_LEN) {
      throw new InvariantViolation(`Team name must be at most ${MAX_NAME_LEN} characters.`);
    }
    this._name = trimmed;
    this._updatedAt = new Date();
  }

  addMember(member: RegistrationMember): void {
    if (this._paymentStatus !== RegistrationPaymentStatus.None) {
      throw new InvariantViolation(
        'Cannot edit the roster after captain checkout has started. Refund first.',
      );
    }
    if (this._members.length >= MAX_ROSTER_SIZE) {
      throw new InvariantViolation(`Roster may have at most ${MAX_ROSTER_SIZE} members.`);
    }
    assertUniqueMembers([...this._members, member]);
    this._members.push(member);
    this._updatedAt = new Date();
  }

  removeMember(memberId: EventTeamRegistrationMemberId): void {
    if (this._paymentStatus !== RegistrationPaymentStatus.None) {
      throw new InvariantViolation(
        'Cannot edit the roster after captain checkout has started. Refund first.',
      );
    }
    const before = this._members.length;
    this._members = this._members.filter((m) => m.id !== memberId);
    if (this._members.length === before) {
      throw new InvariantViolation(`Member ${memberId} is not on this registration.`);
    }
    this._updatedAt = new Date();
  }

  /** Captain has been redirected to Stripe Checkout for the per-team total. */
  markCheckoutPending(checkoutSessionId: string): void {
    if (this._paymentStatus !== RegistrationPaymentStatus.None) {
      throw new InvariantViolation(
        `Cannot start checkout from payment status "${this._paymentStatus}".`,
      );
    }
    this._paymentStatus = RegistrationPaymentStatus.Pending;
    this._checkoutSessionId = checkoutSessionId;
    this._updatedAt = new Date();
  }

  /**
   * Stripe Checkout Session expired (30-min default) or the captain
   * cancelled out of the hosted page without paying. Reset to None so the
   * captain can edit the roster and start a fresh checkout without having
   * to withdraw the whole registration. No-op if not Pending — the webhook
   * may race the captain's manual retry.
   */
  expireCheckout(): void {
    if (this._paymentStatus !== RegistrationPaymentStatus.Pending) return;
    this._paymentStatus = RegistrationPaymentStatus.None;
    this._checkoutSessionId = null;
    this._updatedAt = new Date();
  }

  /** Webhook confirms the captain's checkout session was paid. */
  markPaid(props: { paymentIntentId: string; amountCents: number; paidAt: Date }): void {
    if (
      this._paymentStatus !== RegistrationPaymentStatus.Pending &&
      this._paymentStatus !== RegistrationPaymentStatus.None
    ) {
      throw new InvariantViolation(
        `Cannot mark paid from payment status "${this._paymentStatus}".`,
      );
    }
    if (!Number.isInteger(props.amountCents) || props.amountCents < 0) {
      throw new InvariantViolation('Paid amount must be a non-negative integer of cents.');
    }
    this._paymentStatus = RegistrationPaymentStatus.Paid;
    this._paymentIntentId = props.paymentIntentId;
    this._amountPaidCents = props.amountCents;
    this._paidAt = props.paidAt;
    this._updatedAt = new Date();
  }

  /**
   * Host records a cash / Venmo / off-platform payment for a walk-in
   * team (ADR 0017). Only legal on `source = 'walk_in'` rows — captain
   * and host-proxy ad-hoc registrations have a real captain account
   * and go through the existing `hostMarkTeamRegistrationPaid` /
   * Stripe paths. The optional `note` is freeform reconciliation
   * context ("Venmo @captain", "five $20s", etc.) and is capped at
   * 500 characters to match the DB constraint.
   */
  markPaidCash(props: { amountCents: number; paidAt: Date; note?: string | null }): void {
    if (this.source !== RegistrationSource.WalkIn) {
      throw new InvariantViolation('Cash payment is only allowed on walk-in registrations.');
    }
    if (
      this._paymentStatus !== RegistrationPaymentStatus.None &&
      this._paymentStatus !== RegistrationPaymentStatus.Pending
    ) {
      throw new InvariantViolation(
        `Cannot mark cash-paid from payment status "${this._paymentStatus}".`,
      );
    }
    if (!Number.isInteger(props.amountCents) || props.amountCents < 0) {
      throw new InvariantViolation('Paid amount must be a non-negative integer of cents.');
    }
    const note = props.note?.trim() || null;
    if (note && note.length > 500) {
      throw new InvariantViolation('Payment note must be at most 500 characters.');
    }
    this._paymentStatus = RegistrationPaymentStatus.Paid;
    this._paymentNote = note;
    this._amountPaidCents = props.amountCents;
    this._paidAt = props.paidAt;
    this._updatedAt = new Date();
  }

  /** Host refund or captain cancellation after payment. */
  markRefunded(): void {
    if (this._paymentStatus !== RegistrationPaymentStatus.Paid) {
      throw new InvariantViolation(`Cannot refund from payment status "${this._paymentStatus}".`);
    }
    this._paymentStatus = RegistrationPaymentStatus.Refunded;
    this._updatedAt = new Date();
  }
}

/**
 * Enforce the source ↔ identity discriminant from ADR 0017 in the
 * factory before the row reaches the DB check constraint of the same
 * shape. Throws a typed {@link InvariantViolation} so callers can map
 * it to a validation flash without scraping the Postgres error.
 */
function assertSourceIdentity(
  source: RegistrationSource,
  captainId: UserId | null,
  captainDisplayName: string | null,
): void {
  if (source === RegistrationSource.WalkIn) {
    if (captainId !== null) {
      throw new InvariantViolation('Walk-in registrations cannot link to a captain account.');
    }
    if (!captainDisplayName) {
      throw new InvariantViolation(
        'Walk-in registrations require a captain display name (typed at the table).',
      );
    }
  } else {
    if (captainId === null) {
      throw new InvariantViolation(
        `Registrations with source "${source}" require a captain account.`,
      );
    }
  }
}

function assertUniqueMembers(members: ReadonlyArray<RegistrationMember>): void {
  const seenUsers = new Set<UserId>();
  for (const m of members) {
    if (m.userId) {
      if (seenUsers.has(m.userId)) {
        throw new InvariantViolation(`User ${m.userId} is listed more than once on the roster.`);
      }
      seenUsers.add(m.userId);
    }
  }
}
