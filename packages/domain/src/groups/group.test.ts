import { describe, it, expect } from 'vitest';
import { Group, type GroupId, type UserId, type GroupProfileEdit } from './group.js';
import { ValidationError } from '../shared/result.js';

const GID = 'g-1' as GroupId;
const OWNER = 'owner-1' as UserId;

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
