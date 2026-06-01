import { describe, it, expect } from 'vitest';
import { UserProfile, type ProfileDetailsEdit, type UserId } from './user-profile.js';
import { InvariantViolation, ValidationError } from '../shared/result.js';

const ME = 'me' as UserId;
const OTHER = 'other' as UserId;

function rehydrated(
  overrides: Partial<Parameters<typeof UserProfile.fromPersistence>[0]> = {},
): UserProfile {
  return UserProfile.fromPersistence({
    id: ME,
    displayName: 'Alice',
    firstName: 'Alice',
    lastName: 'Ace',
    homeCity: 'VB',
    handle: 'alice-ace',
    positions: { primary: 'setter', secondary: null, tertiary: null },
    socialHandles: {
      instagram: 'alice',
      tiktok: null,
      twitter: null,
      facebook: null,
      youtube: null,
      website: null,
    },
    autoAcceptTeamInvites: false,
    showProBadge: true,
    themePreference: 'dark',
    heroImageUrl: 'https://img/hero.png',
    avatarUrl: 'https://img/avatar.png',
    businessInfo: { businessName: 'Bumps LLC', businessAddress: '1 Net St', taxId: '12-345' },
    ...overrides,
  });
}

const EDIT: ProfileDetailsEdit = {
  displayName: 'New Name',
  firstName: 'New',
  lastName: 'Name',
  homeCity: 'Norfolk',
  positions: { primary: 'libero', secondary: 'setter', tertiary: null },
  socialHandles: {
    instagram: 'newig',
    tiktok: 'newtt',
    twitter: null,
    facebook: null,
    youtube: null,
    website: 'example.com',
  },
  autoAcceptTeamInvites: true,
  showProBadge: false,
};

describe('UserProfile.create', () => {
  it('creates with a valid display name + handle', () => {
    const p = UserProfile.create({ id: ME, displayName: 'Alice', handle: 'alice' });
    expect(p.displayName).toBe('Alice');
    expect(p.handle).toBe('alice');
    expect(p.showProBadge).toBe(false);
  });

  it('trims the display name', () => {
    const p = UserProfile.create({ id: ME, displayName: '  Bob  ', handle: 'bob' });
    expect(p.displayName).toBe('Bob');
  });

  it('rejects an empty display name with ValidationError', () => {
    expect(() => UserProfile.create({ id: ME, displayName: '   ', handle: 'x' })).toThrow(
      ValidationError,
    );
  });

  it('rejects an invalid handle with ValidationError', () => {
    // leading dash + too short
    expect(() => UserProfile.create({ id: ME, displayName: 'A', handle: '-bad' })).toThrow(
      ValidationError,
    );
  });
});

describe('UserProfile.fromPersistence', () => {
  it('rehydrates without re-validating (legacy rows survive)', () => {
    const p = rehydrated({ displayName: '', handle: 'X_not valid' });
    expect(p.displayName).toBe('');
    expect(p.handle).toBe('X_not valid');
  });

  it('exposes the grouped value objects', () => {
    const p = rehydrated();
    expect(p.positions.primary).toBe('setter');
    expect(p.socialHandles.instagram).toBe('alice');
    expect(p.showProBadge).toBe(true);
  });
});

describe('UserProfile.editDetails', () => {
  it('applies every editable field', () => {
    const p = rehydrated();
    p.editDetails(EDIT);
    expect(p.displayName).toBe('New Name');
    expect(p.firstName).toBe('New');
    expect(p.homeCity).toBe('Norfolk');
    expect(p.positions).toEqual({ primary: 'libero', secondary: 'setter', tertiary: null });
    expect(p.socialHandles.tiktok).toBe('newtt');
    expect(p.socialHandles.website).toBe('example.com');
    expect(p.autoAcceptTeamInvites).toBe(true);
    expect(p.showProBadge).toBe(false);
  });

  it('trims and rejects an empty display name with ValidationError', () => {
    const p = rehydrated();
    expect(() => p.editDetails({ ...EDIT, displayName: '   ' })).toThrow(ValidationError);
  });

  it('does not alias the passed-in value objects', () => {
    const p = rehydrated();
    const edit = { ...EDIT, positions: { primary: 'setter', secondary: null, tertiary: null } };
    p.editDetails(edit);
    edit.positions.primary = 'mutated';
    expect(p.positions.primary).toBe('setter');
  });

  it('leaves the handle untouched', () => {
    const p = rehydrated();
    p.editDetails(EDIT);
    expect(p.handle).toBe('alice-ace');
  });
});

describe('UserProfile.changeHandle', () => {
  it('accepts a valid handle', () => {
    const p = rehydrated();
    p.changeHandle('new-handle-99');
    expect(p.handle).toBe('new-handle-99');
  });

  it('accepts the 3-char minimum but rejects 2 chars', () => {
    const p = rehydrated();
    expect(() => p.changeHandle('abc')).not.toThrow();
    expect(() => p.changeHandle('ab')).toThrow(ValidationError);
  });

  it('rejects a leading dash', () => {
    const p = rehydrated();
    expect(() => p.changeHandle('-nope')).toThrow(ValidationError);
  });

  it('rejects a trailing dash', () => {
    const p = rehydrated();
    expect(() => p.changeHandle('nope-')).toThrow(ValidationError);
  });

  it('rejects uppercase / underscores', () => {
    const p = rehydrated();
    expect(() => p.changeHandle('Bad_Handle')).toThrow(ValidationError);
  });
});

describe('UserProfile auxiliary writes', () => {
  it('rehydrates theme / hero / business info', () => {
    const p = rehydrated();
    expect(p.themePreference).toBe('dark');
    expect(p.heroImageUrl).toBe('https://img/hero.png');
    expect(p.avatarUrl).toBe('https://img/avatar.png');
    expect(p.businessInfo).toEqual({
      businessName: 'Bumps LLC',
      businessAddress: '1 Net St',
      taxId: '12-345',
    });
  });

  it('setTheme replaces the stored preference', () => {
    const p = rehydrated();
    p.setTheme('light');
    expect(p.themePreference).toBe('light');
  });

  it('setHeroImage sets and clears the url', () => {
    const p = rehydrated();
    p.setHeroImage('https://img/new.png');
    expect(p.heroImageUrl).toBe('https://img/new.png');
    p.setHeroImage(null);
    expect(p.heroImageUrl).toBeNull();
  });

  it('setAvatar sets and clears the url', () => {
    const p = rehydrated();
    p.setAvatar('https://img/new-avatar.png');
    expect(p.avatarUrl).toBe('https://img/new-avatar.png');
    p.setAvatar(null);
    expect(p.avatarUrl).toBeNull();
  });

  it('setBusinessInfo replaces the fields and does not alias the input', () => {
    const p = rehydrated();
    const info = { businessName: 'New Co', businessAddress: null, taxId: null };
    p.setBusinessInfo(info);
    info.businessName = 'mutated';
    expect(p.businessInfo.businessName).toBe('New Co');
  });

  it('aux writes leave the editable details untouched', () => {
    const p = rehydrated();
    p.setTheme('light');
    p.setHeroImage(null);
    expect(p.displayName).toBe('Alice');
    expect(p.handle).toBe('alice-ace');
    expect(p.positions.primary).toBe('setter');
  });
});

describe('UserProfile friend graph', () => {
  it('adds and removes a friend', () => {
    const p = rehydrated();
    p.addFriend(OTHER);
    expect(p.isFriendsWith(OTHER)).toBe(true);
    p.removeFriend(OTHER);
    expect(p.isFriendsWith(OTHER)).toBe(false);
  });

  it('rejects friending yourself with InvariantViolation', () => {
    const p = rehydrated();
    expect(() => p.addFriend(ME)).toThrow(InvariantViolation);
  });

  it('assertCanFriend guards self-friend without an instance (edge-write path)', () => {
    expect(() => UserProfile.assertCanFriend(ME, ME)).toThrow(InvariantViolation);
    expect(() => UserProfile.assertCanFriend(ME, OTHER)).not.toThrow();
  });
});
