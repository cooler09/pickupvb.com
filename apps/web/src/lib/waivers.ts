import 'server-only';
import { getServerSupabase } from './supabase';
import { getAdminSupabase } from './supabase-admin';

/**
 * Per-event liability waivers (monetization O-9). Free for any host, soft
 * enforcement (presented + recorded, registration not blocked). Reads of the
 * waiver + the viewer's own signature go through the session client (RLS:
 * waiver is public-read, signature is self-read); the host's full signature
 * list goes through the admin client (gated by canManage in the page).
 */

export type EventWaiver = {
  eventId: string;
  title: string;
  body: string | null;
  externalUrl: string | null;
  version: number;
};

export type ViewerSignature = {
  waiverVersion: number;
  signedName: string;
  signedAt: string;
};

export type SignatureRow = {
  id: string;
  signedName: string;
  signedAt: string;
  waiverVersion: number;
  method: 'self' | 'in_person';
};

export async function getEventWaiver(eventId: string): Promise<EventWaiver | null> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('event_waivers')
    .select('event_id, title, body, external_url, version')
    .eq('event_id', eventId)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    event_id: string;
    title: string;
    body: string | null;
    external_url: string | null;
    version: number;
  };
  return {
    eventId: r.event_id,
    title: r.title,
    body: r.body,
    externalUrl: r.external_url,
    version: r.version,
  };
}

/** The viewer's own signature for this event, if any (RLS self-read). */
export async function getViewerSignature(
  eventId: string,
  userId: string,
): Promise<ViewerSignature | null> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('waiver_signatures')
    .select('waiver_version, signed_name, signed_at')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  const r = data as { waiver_version: number; signed_name: string; signed_at: string };
  return { waiverVersion: r.waiver_version, signedName: r.signed_name, signedAt: r.signed_at };
}

/** Signature count for the host view (admin client — host reads everyone's). */
export async function countSignatures(eventId: string): Promise<number> {
  const { count } = await getAdminSupabase()
    .from('waiver_signatures')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);
  return count ?? 0;
}

/** Full signature list for the host's record (admin client). */
export async function listSignatures(eventId: string): Promise<SignatureRow[]> {
  const { data } = await getAdminSupabase()
    .from('waiver_signatures')
    .select('id, signed_name, signed_at, waiver_version, method')
    .eq('event_id', eventId)
    .order('signed_at', { ascending: false });
  return (
    (data as
      | {
          id: string;
          signed_name: string;
          signed_at: string;
          waiver_version: number;
          method: string;
        }[]
      | null) ?? []
  ).map((r) => ({
    id: r.id,
    signedName: r.signed_name,
    signedAt: r.signed_at,
    waiverVersion: r.waiver_version,
    method: r.method === 'in_person' ? 'in_person' : 'self',
  }));
}

/**
 * Host records an in-person signature by name (admin client; the page gates
 * canManage). `user_id` stays null — these are free-text names (paper signers /
 * walk-ins), not tied to an attendee account.
 */
export async function addManualSignature(input: {
  eventId: string;
  name: string;
  hostUserId: string;
  waiverVersion: number;
}): Promise<void> {
  await getAdminSupabase().from('waiver_signatures').insert({
    event_id: input.eventId,
    user_id: null,
    waiver_version: input.waiverVersion,
    signed_name: input.name,
    method: 'in_person',
    recorded_by_user_id: input.hostUserId,
  });
}

/** Host removes any signature record on their event (admin client). */
export async function removeSignature(eventId: string, signatureId: string): Promise<void> {
  await getAdminSupabase()
    .from('waiver_signatures')
    .delete()
    .eq('id', signatureId)
    .eq('event_id', eventId);
}
