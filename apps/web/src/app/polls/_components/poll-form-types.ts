/**
 * Client-safe shared types for the poll builder + host actions (ADR 0041).
 * No 'use server' / 'server-only' so both the `'use client'` builder and the
 * server actions can import them.
 */
export type PollQuestionKind = 'single' | 'multi';

export interface PollOptionDraftUI {
  label: string;
}

export interface PollQuestionDraftUI {
  prompt: string;
  kind: PollQuestionKind;
  required: boolean;
  options: PollOptionDraftUI[];
}

export interface PollFormValues {
  title: string;
  description: string;
  /** `datetime-local` string (viewer-local), or empty for no close time. */
  closesAt: string;
  showRespondentNames: boolean;
  questions: PollQuestionDraftUI[];
}

export type PollActionResult = { ok: true } | { ok: false; error: string };
