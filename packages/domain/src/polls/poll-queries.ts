/**
 * Read-side queries for polls (CQRS read port; ADR 0041). Writes go through
 * `PollWriteStore` + the `Poll` aggregate; this is the host-facing display side
 * (list rails + the results dashboard), so the shapes are plain camelCase read
 * models with no behaviour. The **public** responder page does NOT use this port
 * — it reads the sessionless `get_poll_config` / `get_poll_results` RPCs.
 */
import type { PollQuestionKind, PollStatus, PollWriteStore } from './poll.js';

/** A poll as shown in the creator's / an event's / a group's poll list. */
export interface PollSummary {
  id: string;
  shortCode: string;
  title: string;
  status: PollStatus;
  closesAt: string | null;
  questionCount: number;
  responseCount: number;
  createdAt: string;
}

/** The host results dashboard: config + per-option tallies + the full response
 * roster (creator-only — RLS gates every read on the user-scoped client). */
export interface HostPollResults {
  id: string;
  shortCode: string;
  title: string;
  description: string;
  status: PollStatus;
  closesAt: string | null;
  showRespondentNames: boolean;
  eventId: string | null;
  groupId: string | null;
  responseCount: number;
  questions: Array<{
    id: string;
    prompt: string;
    kind: PollQuestionKind;
    required: boolean;
    options: Array<{ id: string; label: string; count: number }>;
  }>;
  responses: Array<{
    id: string;
    respondentName: string;
    userId: string | null;
    createdAt: string;
    optionIds: string[];
  }>;
}

export interface PollQueries {
  /** Full results for the host dashboard, or `null` if missing / not the
   * viewer's poll (RLS returns no rows for a non-creator). */
  getHostResults(pollId: string, viewerId: string): Promise<HostPollResults | null>;
  /** The creator's own polls, newest-first (standalone `/polls` list). */
  listByCreator(creatorId: string): Promise<PollSummary[]>;
  /** Polls attached to an event (the event-manage "Polls" section). */
  listByEvent(eventId: string): Promise<PollSummary[]>;
  /** Polls attached to a group (the group page "Polls" section). */
  listByGroup(groupId: string): Promise<PollSummary[]>;
}

/** What the Supabase adapter implements — the write aggregate store plus the
 * read-side queries. */
export interface PollRepository extends PollWriteStore, PollQueries {}
