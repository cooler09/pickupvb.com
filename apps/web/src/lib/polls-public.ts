import 'server-only';

import { createSupabaseAnonClient } from '@pickupvb/supabase';
import { getServerSupabase } from './supabase';
import { verifyTurnstileToken } from './turnstile';
import { consumeRateLimit, getClientIp, rateLimitKey } from './rate-limit';

/**
 * Sessionless public facade for polls (ADR 0041). The responder needs no
 * account, so config + tally reads run on the pure anon client (no cookies →
 * the /p/[code] page stays CDN-cacheable) and the submit runs through the
 * `submit_poll_response` SECURITY DEFINER RPC — the trust boundary that
 * validates open/required/valid-option server-side. Facade-over-RPC (not a
 * command handler) because there is no aggregate invariant to protect on submit
 * (AGENTS.md pattern 10); the RPC is the guard.
 */

export interface PublicPollOption {
  id: string;
  label: string;
}

export interface PublicPollQuestion {
  id: string;
  prompt: string;
  kind: 'single' | 'multi';
  required: boolean;
  options: PublicPollOption[];
}

export interface PublicPollConfig {
  id: string;
  shortCode: string;
  title: string;
  description: string;
  status: 'open' | 'closed';
  closesAt: string | null;
  showRespondentNames: boolean;
  questions: PublicPollQuestion[];
}

/** Per-option tally keyed by option id. `names` is null when the poll's
 * show_respondent_names toggle is off (the RPC gates it server-side). */
export interface PublicPollResults {
  pollId: string;
  totalRespondents: number;
  options: Record<string, { count: number; names: string[] | null }>;
}

export interface SubmitPollAnswer {
  questionId: string;
  optionIds: string[];
}

export type SubmitPollResult =
  | { ok: true; responseId: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

/** Read poll config by short code (public responder page). Returns null when the
 * code is unknown. Uses the cookie-less anon client to keep the page cacheable. */
export async function getPublicPollConfig(code: string): Promise<PublicPollConfig | null> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.rpc('get_poll_config', { p_code: code });
  if (error || !data) return null;
  return data as unknown as PublicPollConfig;
}

/** Live tally for the public page. Names per option only when the toggle is on. */
export async function getPublicPollResults(code: string): Promise<PublicPollResults | null> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.rpc('get_poll_results', { p_code: code });
  if (error || !data) return null;
  return data as unknown as PublicPollResults;
}

/**
 * Submit (or update via "change my answer") a poll response. Turnstile + a
 * per-poll/IP rate limit gate the write; the RPC validates the rest. Uses the
 * cookie-scoped server client so a signed-in responder is linked by user_id as a
 * bonus (auth.uid() inside the RPC), while a signed-out one stays fully anon.
 */
export async function submitPollResponse(input: {
  code: string;
  name: string;
  anonToken: string;
  answers: SubmitPollAnswer[];
  turnstileToken: string | null;
}): Promise<SubmitPollResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Please enter your name.' };

  const turnstile = await verifyTurnstileToken(input.turnstileToken);
  if (!turnstile.ok) {
    return { ok: false, error: turnstile.error ?? 'Verification failed. Please try again.' };
  }

  const ip = await getClientIp();
  const rl = await consumeRateLimit({
    key: rateLimitKey(`poll-submit:${input.code}`, 'ip', ip),
    limit: 40,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return {
      ok: false,
      error: 'Too many responses from this network. Please try again shortly.',
      retryAfterSeconds: rl.retryAfterSeconds,
    };
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc('submit_poll_response', {
    p_code: input.code,
    p_name: name,
    p_anon_token: input.anonToken,
    p_answers: input.answers.map((a) => ({
      question_id: a.questionId,
      option_ids: a.optionIds,
    })),
  });

  if (error) {
    const msg = error.message ?? '';
    if (/closed/i.test(msg)) return { ok: false, error: 'This poll has closed.' };
    if (/required question/i.test(msg)) {
      return { ok: false, error: 'Please answer every required question.' };
    }
    if (/single-select/i.test(msg)) {
      return { ok: false, error: 'Pick just one option for single-choice questions.' };
    }
    if (/not found/i.test(msg)) return { ok: false, error: 'This poll no longer exists.' };
    return { ok: false, error: 'Could not submit your response. Please try again.' };
  }

  const responseId = (data as { response_id?: string } | null)?.response_id ?? '';
  return { ok: true, responseId };
}
