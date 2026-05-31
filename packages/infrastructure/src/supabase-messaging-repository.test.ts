import { describe, it, expect } from 'vitest';
import { rowToView } from './supabase-messaging-repository.js';

// `rowToView` maps a `messages` row + a *separately fetched* sender card into a
// `MessageView`. The sender card is deliberately a second argument rather than an
// embedded `sender:profiles!...` join on the row: the messaging adapters run on a
// user-scoped client and the base `profiles` SELECT policy is owner-only (PII
// audit P1 #4), so an embed would resolve to null for every message sent by
// anyone other than the viewer. The card is looked up from `profiles_public`
// instead. These tests pin the mapping contract that fix depends on.
const baseRow = {
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'u2',
  body: 'hello',
  attachments: [],
  deleted_at: null,
  edited_at: null,
  created_at: '2026-05-31T00:00:00.000Z',
};

describe('rowToView', () => {
  it('resolves sender name/avatar from the supplied card, not the row', () => {
    const view = rowToView(baseRow, { display_name: 'Jordan', avatar_url: 'https://x/a.png' });
    expect(view.senderName).toBe('Jordan');
    expect(view.senderAvatarUrl).toBe('https://x/a.png');
    expect(view.senderId).toBe('u2');
  });

  it('leaves sender name/avatar null when no card resolves (deleted / unknown sender)', () => {
    // A null card is what the profiles_public lookup yields for a since-deleted
    // sender — the UI renders its own "Member" fallback over a null name.
    const view = rowToView(baseRow, null);
    expect(view.senderName).toBeNull();
    expect(view.senderAvatarUrl).toBeNull();
  });

  it('tombstones a soft-deleted message: no body, no attachments', () => {
    const view = rowToView(
      {
        ...baseRow,
        body: 'secret',
        attachments: [{ bucket: 'b', path: 'p', mime: 'image/png' }],
        deleted_at: '2026-05-31T01:00:00.000Z',
      },
      { display_name: 'Jordan', avatar_url: null },
    );
    expect(view.isDeleted).toBe(true);
    expect(view.body).toBe('');
    expect(view.attachments).toEqual([]);
    // The sender card still resolves on a tombstone (who deleted is still shown).
    expect(view.senderName).toBe('Jordan');
  });

  it('flags an edited message', () => {
    const view = rowToView({ ...baseRow, edited_at: '2026-05-31T02:00:00.000Z' }, null);
    expect(view.isEdited).toBe(true);
    expect(view.isDeleted).toBe(false);
  });
});
