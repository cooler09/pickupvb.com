import { describe, it, expect } from 'vitest';
import {
  Group,
  type GroupId,
  type UserId,
  type GroupRole,
  type GroupProfileEdit,
} from './group.js';
import {
  ConflictError,
  InvariantViolation,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../shared/result.js';

const GID = 'g-1' as GroupId;
const OWNER = 'owner-1' as UserId;
const ADMIN = 'admin-1' as UserId;
const MEMBER = 'member-1' as UserId;
const OUTSIDER = 'outsider-1' as UserId;
const OWNER2 = 'owner-2' as UserId;

function withRoster(members: Array<[UserId, GroupRole]>): Group {
  return Group.fromPersistence({
    id: GID,
    slug: 'norfolk-vb',
    name: 'Norfolk VB',
    description: '',
    homeCity: null,
    region: null,
    avatarUrl: null,
    createdBy: OWNER,
    members: members.map(([userId, role]) => ({ userId, role })),
  });
}

function created(overrides: Partial<Parameters<typeof Group.create>[0]> = {}): Group {
  return Group.create({
    id: GID,
    slug: 'norfolk-vb',
    name: 'Norfolk VB',
    createdBy: OWNER,
    ...overrides,
  });
}

const EDIT: GroupProfileEdit = {
  name: 'New Name',
  description: 'desc',
  homeCity: 'Norfolk',
  region: 'VA',
  avatarUrl: 'https://img/a.png',
};

describe('Group.create', () => {
  it('creates with a valid name + slug and sensible defaults', () => {
    const g = created();
    expect(g.id).toBe(GID);
    expect(g.slug).toBe('norfolk-vb');
    expect(g.name).toBe('Norfolk VB');
    expect(g.description).toBe('');
    expect(g.homeCity).toBeNull();
    expect(g.region).toBeNull();
    expect(g.avatarUrl).toBeNull();
    expect(g.createdBy).toBe(OWNER);
  });

  it('trims the name', () => {
    expect(created({ name: '  Spikers  ' }).name).toBe('Spikers');
  });

  it('rejects an empty name with a field-tagged ValidationError', () => {
    try {
      created({ name: '   ' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details).toEqual({ field: 'name' });
    }
  });

  it('rejects a >80-char name', () => {
    expect(() => created({ name: 'x'.repeat(81) })).toThrow(ValidationError);
  });

  it('rejects a bad slug with a field-tagged ValidationError', () => {
    try {
      created({ slug: 'Bad_Slug' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details).toEqual({ field: 'slug' });
    }
  });

  it('rejects a too-short slug (< 3 chars)', () => {
    expect(() => created({ slug: 'ab' })).toThrow(ValidationError);
  });
});

describe('Group.fromPersistence', () => {
  it('rehydrates without re-validating (legacy rows survive)', () => {
    const g = Group.fromPersistence({
      id: GID,
      slug: 'X_invalid',
      name: '',
      description: 'd',
      homeCity: null,
      region: null,
      avatarUrl: null,
      createdBy: OWNER,
      members: [],
    });
    expect(g.slug).toBe('X_invalid');
    expect(g.name).toBe('');
  });
});

describe('Group.editProfile', () => {
  it('applies every editable field and trims name/description', () => {
    const g = created();
    g.editProfile({ ...EDIT, name: '  New Name  ', description: '  desc  ' });
    expect(g.name).toBe('New Name');
    expect(g.description).toBe('desc');
    expect(g.homeCity).toBe('Norfolk');
    expect(g.region).toBe('VA');
    expect(g.avatarUrl).toBe('https://img/a.png');
  });

  it('leaves the slug and createdBy untouched', () => {
    const g = created();
    g.editProfile(EDIT);
    expect(g.slug).toBe('norfolk-vb');
    expect(g.createdBy).toBe(OWNER);
  });

  it('rejects an empty name', () => {
    const g = created();
    expect(() => g.editProfile({ ...EDIT, name: '' })).toThrow(ValidationError);
  });
});

describe('Group.addMember', () => {
  it('lets an owner add a member and reflects it in the diff', () => {
    const g = withRoster([[OWNER, 'owner']]);
    g.addMember(OWNER, MEMBER, 'member');
    expect(g.roleOf(MEMBER)).toBe('member');
    expect(g.memberDiff()).toEqual({
      added: [{ userId: MEMBER, role: 'member' }],
      removed: [],
      roleChanged: [],
    });
  });

  it('lets an admin add a member', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [ADMIN, 'admin'],
    ]);
    g.addMember(ADMIN, MEMBER, 'member');
    expect(g.roleOf(MEMBER)).toBe('member');
  });

  it('rejects a plain member or outsider as actor (UnauthorizedError)', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [MEMBER, 'member'],
    ]);
    expect(() => g.addMember(MEMBER, OUTSIDER, 'member')).toThrow(UnauthorizedError);
    expect(() => g.addMember(OUTSIDER, OUTSIDER, 'member')).toThrow(UnauthorizedError);
  });

  it('rejects adding someone already a member (ConflictError)', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [MEMBER, 'member'],
    ]);
    expect(() => g.addMember(OWNER, MEMBER, 'admin')).toThrow(ConflictError);
  });
});

describe('Group.removeMember', () => {
  it('lets an owner/admin remove a member', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [MEMBER, 'member'],
    ]);
    g.removeMember(OWNER, MEMBER);
    expect(g.roleOf(MEMBER)).toBeNull();
    expect(g.memberDiff().removed).toEqual([MEMBER]);
  });

  it('allows self-leave by a plain member', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [MEMBER, 'member'],
    ]);
    g.removeMember(MEMBER, MEMBER);
    expect(g.roleOf(MEMBER)).toBeNull();
  });

  it('rejects removing the last owner (InvariantViolation), incl. self', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [ADMIN, 'admin'],
    ]);
    expect(() => g.removeMember(OWNER, OWNER)).toThrow(InvariantViolation);
    expect(() => g.removeMember(ADMIN, OWNER)).toThrow(InvariantViolation);
  });

  it('allows removing an owner when another owner remains', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [OWNER2, 'owner'],
    ]);
    g.removeMember(OWNER, OWNER2);
    expect(g.roleOf(OWNER2)).toBeNull();
  });

  it('is a no-op for a non-member (empty diff)', () => {
    const g = withRoster([[OWNER, 'owner']]);
    g.removeMember(OWNER, OUTSIDER);
    expect(g.memberDiff()).toEqual({ added: [], removed: [], roleChanged: [] });
  });
});

describe('Group.changeMemberRole', () => {
  it('lets an owner change a member role and reflects it in the diff', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [MEMBER, 'member'],
    ]);
    g.changeMemberRole(OWNER, MEMBER, 'admin');
    expect(g.roleOf(MEMBER)).toBe('admin');
    expect(g.memberDiff().roleChanged).toEqual([{ userId: MEMBER, role: 'admin' }]);
  });

  it('rejects a non-manager actor', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [MEMBER, 'member'],
    ]);
    expect(() => g.changeMemberRole(MEMBER, OWNER, 'member')).toThrow(UnauthorizedError);
  });

  it('rejects an unknown target (NotFoundError)', () => {
    const g = withRoster([[OWNER, 'owner']]);
    expect(() => g.changeMemberRole(OWNER, OUTSIDER, 'admin')).toThrow(NotFoundError);
  });

  it('rejects demoting the last owner (InvariantViolation)', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [ADMIN, 'admin'],
    ]);
    expect(() => g.changeMemberRole(OWNER, OWNER, 'admin')).toThrow(InvariantViolation);
  });

  it('allows demoting an owner when another owner remains', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [OWNER2, 'owner'],
    ]);
    g.changeMemberRole(OWNER, OWNER2, 'member');
    expect(g.roleOf(OWNER2)).toBe('member');
  });
});

describe('Group.memberDiff', () => {
  it('is empty for an untouched aggregate', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [MEMBER, 'member'],
    ]);
    expect(g.memberDiff()).toEqual({ added: [], removed: [], roleChanged: [] });
  });
});

describe('Group.assertCanDelete', () => {
  it('allows an owner', () => {
    const g = withRoster([[OWNER, 'owner']]);
    expect(() => g.assertCanDelete(OWNER)).not.toThrow();
  });

  it('rejects an admin, member, or outsider (UnauthorizedError)', () => {
    const g = withRoster([
      [OWNER, 'owner'],
      [ADMIN, 'admin'],
      [MEMBER, 'member'],
    ]);
    expect(() => g.assertCanDelete(ADMIN)).toThrow(UnauthorizedError);
    expect(() => g.assertCanDelete(MEMBER)).toThrow(UnauthorizedError);
    expect(() => g.assertCanDelete(OUTSIDER)).toThrow(UnauthorizedError);
  });
});
