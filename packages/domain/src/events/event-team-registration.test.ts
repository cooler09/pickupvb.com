import { describe, it, expect } from 'vitest';
import {
  EventTeamRegistration,
  RegistrationMember,
  RegistrationPaymentStatus,
  RegistrationSource,
  type EventTeamRegistrationId,
  type EventTeamRegistrationMemberId,
} from './event-team-registration.js';
import type { DivisionId } from './division.js';
import type { UserId } from './volleyball-event.js';
import { InvariantViolation } from '../shared/result.js';

const REG = 'reg-1' as EventTeamRegistrationId;
const EVENT = 'evt-1';
const DIV = 'div-1' as DivisionId;
const CAP = 'captain' as UserId;

function memberId(s: string): EventTeamRegistrationMemberId {
  return s as EventTeamRegistrationMemberId;
}

function userMember(id: string, user: string, sortOrder = 0): RegistrationMember {
  return RegistrationMember.create({
    id: memberId(id),
    userId: user as UserId,
    displayName: null,
    email: null,
    sortOrder,
  });
}

function guestMember(id: string, name: string, sortOrder = 0): RegistrationMember {
  return RegistrationMember.create({
    id: memberId(id),
    userId: null,
    displayName: name,
    email: null,
    sortOrder,
  });
}

function makeReg(members: RegistrationMember[]): EventTeamRegistration {
  return EventTeamRegistration.create({
    id: REG,
    eventId: EVENT,
    divisionId: DIV,
    captainId: CAP,
    name: 'Spike Force',
    members,
  });
}

describe('RegistrationMember.create', () => {
  it('requires either userId or displayName', () => {
    expect(() =>
      RegistrationMember.create({
        id: memberId('m'),
        userId: null,
        displayName: null,
        email: null,
        sortOrder: 0,
      }),
    ).toThrow(InvariantViolation);
  });

  it('accepts a guest with only a displayName', () => {
    const m = guestMember('m', 'Guest A');
    expect(m.displayName).toBe('Guest A');
    expect(m.userId).toBeNull();
  });

  it('accepts a linked user with no displayName', () => {
    const m = userMember('m', 'u1');
    expect(m.userId).toBe('u1');
  });

  it('trims displayName and rejects when it collapses to empty', () => {
    expect(() =>
      RegistrationMember.create({
        id: memberId('m'),
        userId: null,
        displayName: '   ',
        email: null,
        sortOrder: 0,
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects negative sortOrder', () => {
    expect(() =>
      RegistrationMember.create({
        id: memberId('m'),
        userId: 'u' as UserId,
        displayName: null,
        email: null,
        sortOrder: -1,
      }),
    ).toThrow(InvariantViolation);
  });
});

describe('EventTeamRegistration.create', () => {
  it('starts in payment status none', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    expect(reg.paymentStatus).toBe(RegistrationPaymentStatus.None);
    expect(reg.rosterSize).toBe(1);
  });

  it('rejects empty name', () => {
    expect(() =>
      EventTeamRegistration.create({
        id: REG,
        eventId: EVENT,
        divisionId: DIV,
        captainId: CAP,
        name: '   ',
        members: [],
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects names longer than 80 chars', () => {
    expect(() =>
      EventTeamRegistration.create({
        id: REG,
        eventId: EVENT,
        divisionId: DIV,
        captainId: CAP,
        name: 'x'.repeat(81),
        members: [],
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects rosters larger than 24', () => {
    const members = Array.from({ length: 25 }, (_, i) => guestMember(`m${i}`, `Guest ${i}`, i));
    expect(() => makeReg(members)).toThrow(InvariantViolation);
  });

  it('rejects duplicate linked userIds', () => {
    expect(() => makeReg([userMember('m1', 'u1'), userMember('m2', 'u1', 1)])).toThrow(
      InvariantViolation,
    );
  });
});

describe('EventTeamRegistration walk-in source', () => {
  // Pins the source ↔ identity discriminant the boundary (and the DB
  // check constraint `event_team_entries_captain_identity`) depend on:
  // walk-ins must carry a typed-at-the-table captain display name
  // distinct from the team name, and must NOT link a captain account.
  function makeWalkIn(props: {
    captainId?: string | null;
    captainDisplayName: string | null;
  }): EventTeamRegistration {
    return EventTeamRegistration.create({
      id: REG,
      eventId: EVENT,
      divisionId: DIV,
      captainId: (props.captainId ?? null) as UserId | null,
      name: 'Spike Force',
      members: [guestMember('m', 'Guest A')],
      source: RegistrationSource.WalkIn,
      captainDisplayName: props.captainDisplayName,
    });
  }

  it('preserves captainDisplayName distinct from the team name', () => {
    const reg = makeWalkIn({ captainDisplayName: 'Jamie Q.' });
    expect(reg.name).toBe('Spike Force');
    expect(reg.captainDisplayName).toBe('Jamie Q.');
    expect(reg.captainId).toBeNull();
    expect(reg.source).toBe(RegistrationSource.WalkIn);
  });

  it('requires a captainDisplayName', () => {
    expect(() => makeWalkIn({ captainDisplayName: null })).toThrow(InvariantViolation);
    expect(() => makeWalkIn({ captainDisplayName: '   ' })).toThrow(InvariantViolation);
  });

  it('rejects a linked captain account', () => {
    expect(() => makeWalkIn({ captainId: 'captain', captainDisplayName: 'Jamie Q.' })).toThrow(
      InvariantViolation,
    );
  });
});

describe('EventTeamRegistration.assignCaptain (ADR 0033 Phase 3)', () => {
  function walkIn(): EventTeamRegistration {
    return EventTeamRegistration.create({
      id: REG,
      eventId: EVENT,
      divisionId: DIV,
      captainId: null,
      name: 'Spike Force',
      members: [guestMember('m', 'Guest A')],
      source: RegistrationSource.WalkIn,
      captainDisplayName: 'Jamie Q.',
      captainPhone: '555-0100',
    });
  }

  it('links a real captain and clears the walk-in placeholder identity', () => {
    const reg = walkIn();
    reg.assignCaptain('alice' as UserId);
    expect(reg.captainId).toBe('alice');
    // DB stores this as source='ad_hoc' (a real account now stands behind it).
    expect(reg.source).toBe(RegistrationSource.Captain);
    expect(reg.captainDisplayName).toBeNull();
    expect(reg.captainPhone).toBeNull();
  });

  it('refuses a registration that already has a captain', () => {
    const reg = walkIn();
    reg.assignCaptain('alice' as UserId);
    expect(() => reg.assignCaptain('bob' as UserId)).toThrow(InvariantViolation);
  });
});

describe('EventTeamRegistration.addMember / removeMember', () => {
  it('adds a member when payment has not started', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.addMember(guestMember('m2', 'Guest', 1));
    expect(reg.rosterSize).toBe(2);
  });

  it('rejects addMember once checkout is pending', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.markCheckoutPending('cs_test_123');
    expect(() => reg.addMember(guestMember('m2', 'Guest', 1))).toThrow(InvariantViolation);
  });

  it('rejects removeMember once checkout is pending', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.markCheckoutPending('cs_test_123');
    expect(() => reg.removeMember(memberId('m1'))).toThrow(InvariantViolation);
  });

  it('throws when removing a non-existent member', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    expect(() => reg.removeMember(memberId('nope'))).toThrow(InvariantViolation);
  });
});

describe('EventTeamRegistration payment transitions', () => {
  it('allows markPaid from None (direct webhook)', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.markPaid({ paymentIntentId: 'pi_1', amountCents: 5000, paidAt: new Date() });
    expect(reg.paymentStatus).toBe(RegistrationPaymentStatus.Paid);
    expect(reg.amountPaidCents).toBe(5000);
  });

  it('allows markPaid from Pending', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.markCheckoutPending('cs_1');
    reg.markPaid({ paymentIntentId: 'pi_1', amountCents: 5000, paidAt: new Date() });
    expect(reg.paymentStatus).toBe(RegistrationPaymentStatus.Paid);
  });

  it('rejects markPaid from Refunded', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.markPaid({ paymentIntentId: 'pi_1', amountCents: 5000, paidAt: new Date() });
    reg.markRefunded();
    expect(() =>
      reg.markPaid({ paymentIntentId: 'pi_2', amountCents: 5000, paidAt: new Date() }),
    ).toThrow(InvariantViolation);
  });

  it('only allows markRefunded from Paid', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    expect(() => reg.markRefunded()).toThrow(InvariantViolation);
  });

  it('expireCheckout resets Pending → None and clears session id', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.markCheckoutPending('cs_1');
    expect(reg.checkoutSessionId).toBe('cs_1');
    reg.expireCheckout();
    expect(reg.paymentStatus).toBe(RegistrationPaymentStatus.None);
    expect(reg.checkoutSessionId).toBeNull();
  });

  it('expireCheckout is a no-op when status is not Pending', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.expireCheckout();
    expect(reg.paymentStatus).toBe(RegistrationPaymentStatus.None);
    reg.markPaid({ paymentIntentId: 'pi', amountCents: 100, paidAt: new Date() });
    reg.expireCheckout();
    expect(reg.paymentStatus).toBe(RegistrationPaymentStatus.Paid);
  });

  it('captain can restart checkout after expiry', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.markCheckoutPending('cs_1');
    reg.expireCheckout();
    reg.markCheckoutPending('cs_2');
    expect(reg.checkoutSessionId).toBe('cs_2');
  });

  it('roster edits are allowed again after expireCheckout', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.markCheckoutPending('cs_1');
    reg.expireCheckout();
    reg.addMember(guestMember('m2', 'Guest', 1));
    expect(reg.rosterSize).toBe(2);
  });
});

describe('EventTeamRegistration forfeit lifecycle', () => {
  it('starts unforfeited', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    expect(reg.forfeitedAt).toBeNull();
  });

  it('markForfeited stamps the timestamp and bumps updatedAt', async () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    const before = reg.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    const at = new Date('2026-10-15T12:00:00Z');
    reg.markForfeited(at);
    expect(reg.forfeitedAt).toEqual(at);
    expect(reg.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it('markForfeited is idempotent — keeps the original timestamp', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    const first = new Date('2026-10-15T12:00:00Z');
    reg.markForfeited(first);
    reg.markForfeited(new Date('2026-11-01T00:00:00Z'));
    expect(reg.forfeitedAt).toEqual(first);
  });

  it('rejects an invalid Date', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    expect(() => reg.markForfeited(new Date('not-a-date'))).toThrow(InvariantViolation);
  });

  it('reinstate clears the timestamp', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.markForfeited(new Date('2026-10-15T12:00:00Z'));
    reg.reinstate();
    expect(reg.forfeitedAt).toBeNull();
  });

  it('reinstate on an active team is a no-op', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    const before = reg.updatedAt;
    reg.reinstate();
    expect(reg.forfeitedAt).toBeNull();
    expect(reg.updatedAt.getTime()).toBe(before.getTime());
  });

  it('forfeit is orthogonal to payment status — a paid team can forfeit', () => {
    const reg = makeReg([userMember('m1', 'u1')]);
    reg.markCheckoutPending('cs_1');
    reg.markPaid({
      paymentIntentId: 'pi_1',
      amountCents: 12000,
      paidAt: new Date('2026-09-01T00:00:00Z'),
    });
    reg.markForfeited(new Date('2026-10-15T12:00:00Z'));
    expect(reg.paymentStatus).toBe(RegistrationPaymentStatus.Paid);
    expect(reg.forfeitedAt).not.toBeNull();
  });

  it('rehydrate round-trips forfeitedAt', () => {
    const at = new Date('2026-10-15T12:00:00Z');
    const reg = EventTeamRegistration.rehydrate({
      id: REG,
      eventId: EVENT,
      divisionId: DIV,
      captainId: CAP,
      name: 'Spike Force',
      members: [userMember('m1', 'u1')],
      source: RegistrationSource.Captain,
      paymentStatus: RegistrationPaymentStatus.None,
      checkoutSessionId: null,
      paymentIntentId: null,
      amountPaidCents: null,
      paidAt: null,
      paymentNote: null,
      forfeitedAt: at,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    });
    expect(reg.forfeitedAt).toEqual(at);
  });
});
