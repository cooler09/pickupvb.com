import { describe, it, expect } from 'vitest';
import { ConversationId, UserId } from '@pickupvb/domain';
import { rowToView, SupabaseConversationRepository } from './supabase-messaging-repository.js';

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

// `markRead` advances the caller's own read cursor by upserting their
// `conversation_participants` row. It must be best-effort: a platform admin can
// open a conversation they're not a member of (the `conversations` SELECT policy
// has an `is_platform_admin()` bypass that `conversation_participants_insert`
// lacks), so the upsert comes back RLS-denied (42501) — and there's no cursor to
// maintain for a non-participant. Pre-fix that 500-ed the whole /messages/[id]
// page; these tests pin the swallow without masking real DB failures.
describe('SupabaseConversationRepository.markRead', () => {
  function repoWithUpsertResult(error: { code: string; message: string } | null) {
    let payload: unknown;
    const client = {
      from: () => ({
        upsert: (values: unknown) => {
          payload = values;
          return Promise.resolve({ error });
        },
      }),
    };
    return { repo: new SupabaseConversationRepository(client as never), getPayload: () => payload };
  }

  it('upserts the caller’s own row with a fresh read cursor', async () => {
    const { repo, getPayload } = repoWithUpsertResult(null);
    await repo.markRead(ConversationId('c1'), UserId('u1'));
    expect(getPayload()).toMatchObject({ conversation_id: 'c1', user_id: 'u1' });
    expect((getPayload() as { last_read_at: string }).last_read_at).toEqual(expect.any(String));
  });

  it('is best-effort: swallows an RLS denial (admin opened a non-member conversation)', async () => {
    const { repo } = repoWithUpsertResult({
      code: '42501',
      message: 'new row violates row-level security policy for table "conversation_participants"',
    });
    await expect(repo.markRead(ConversationId('c1'), UserId('admin'))).resolves.toBeUndefined();
  });

  it('still throws on a non-RLS failure (a real DB error stays loud)', async () => {
    const { repo } = repoWithUpsertResult({ code: '08006', message: 'connection failure' });
    await expect(repo.markRead(ConversationId('c1'), UserId('u1'))).rejects.toThrow(
      /markRead\(c1\) failed/,
    );
  });
});
