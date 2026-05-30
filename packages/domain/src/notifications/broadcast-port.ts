/**
 * Persistence port for host/captain **broadcasts** (ADR 0022). A broadcast is
 * one row in `broadcasts` recording a message a host (event) or captain (team)
 * sent to an audience; the actual per-recipient delivery goes through the
 * notification fan-out (`notify`).
 *
 * Client note: the adapter is client-injected and the **caller picks the client
 * per operation**. `create` / `findSender` run on the viewer's session client
 * so RLS enforces host/captain (insert) and lets the sender read their own row;
 * `markSent` / `softDelete` run on the service-role client (RLS-bypass — the
 * fan-out reaches every recipient, and the soft-delete trips the same
 * select-as-WITH-CHECK quirk as group delete — sender authorization is enforced
 * in the action first, AGENTS.md pitfall #8).
 */

export type BroadcastAudienceType = 'event_attendees' | 'team_members';

export interface BroadcastInput {
  senderId: string;
  audienceType: BroadcastAudienceType;
  audienceId: string;
  subject: string | null;
  body: string;
  channels: string[];
}

export interface BroadcastPort {
  /** Record a broadcast (call on the user client — RLS enforces host/captain). */
  create(input: BroadcastInput): Promise<{ id: string }>;
  /** Mark a broadcast delivered once fan-out completes (admin client). */
  markSent(id: string): Promise<void>;
  /** The sender of a broadcast, for sender-only authorization (user client). */
  findSender(id: string): Promise<{ id: string; senderId: string } | null>;
  /** Soft-delete a broadcast — admin client, after the action authorizes the sender. */
  softDelete(id: string): Promise<void>;
}
