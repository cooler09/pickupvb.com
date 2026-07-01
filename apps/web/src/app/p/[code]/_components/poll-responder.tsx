'use client';

import { useCallback, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase';
import { Alert } from '@/components/alert';
import { fieldInputClass, fieldLabelClass } from '@/components/field-styles';
import { primaryButtonClass, textButtonClass } from '@/components/primary-button';
import { TurnstileWidget } from '@/components/turnstile-widget';
import type { PublicPollConfig, PublicPollResults, SubmitPollAnswer } from '@/lib/polls-public';
import { submitPollResponseAction } from '../submit-action';

interface PollResponderProps {
  config: PublicPollConfig;
  initialResults: PublicPollResults | null;
  /** Computed server-side (avoids an impure `new Date()` in render). */
  isClosed: boolean;
}

interface StoredSubmission {
  name: string;
  answers: Record<string, string[]>;
}

const STORAGE_PREFIX = 'pvb_poll_';
const STORE_EVENT = 'pvb-poll-store';

function safeParse(raw: string | null): StoredSubmission | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as StoredSubmission;
    return v && typeof v.name === 'string' && v.answers ? v : null;
  } catch {
    return null;
  }
}

/**
 * The responder's own prior submission, persisted per-poll in localStorage so a
 * return visit (the page itself is CDN-cached) shows their answer + the tally
 * instead of a blank form. `useSyncExternalStore` (not `useEffect`+setState) is
 * the sanctioned pattern — `getServerSnapshot` returns null so SSR and the first
 * client render agree, then it reconciles to the stored value after hydration.
 */
function useStoredRaw(pollId: string): string | null {
  const key = STORAGE_PREFIX + pollId;
  const subscribe = useCallback((onChange: () => void) => {
    // Re-read on writes from this tab (custom event) and other tabs (storage).
    window.addEventListener(STORE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(STORE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

function persistSubmission(pollId: string, submission: StoredSubmission) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + pollId, JSON.stringify(submission));
    window.dispatchEvent(new Event(STORE_EVENT));
  } catch {
    /* private mode / storage full — the in-memory tally still updates */
  }
}

/**
 * The public poll responder (ADR 0041). Fully sessionless: a stranger answers
 * with just a name — no account, no login. On submit it posts through the
 * `submit_poll_response` RPC (via the server action) and flips to a thank-you
 * state showing the live tally, with "Change my answer" to re-open the form.
 * A prior answer is restored across visits from localStorage.
 */
export function PollResponder({ config, initialResults, isClosed }: PollResponderProps) {
  const rawStored = useStoredRaw(config.id);
  const stored = useMemo(() => safeParse(rawStored), [rawStored]);
  const [manualForm, setManualForm] = useState(false);
  const [results, setResults] = useState<PublicPollResults | null>(initialResults);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Bumped after every submit so the Turnstile widget remounts with a FRESH
  // token — its token is single-use, so a retry / "change my answer" that reused
  // it would be rejected by Cloudflare as `timeout-or-duplicate`.
  const [turnstileKey, setTurnstileKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Show the form when the poll is open AND (they haven't answered yet OR they
  // clicked "change my answer"). Otherwise show the tally.
  const showForm = !isClosed && (manualForm || !stored);

  async function refreshResults() {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.rpc('get_poll_results', { p_code: config.shortCode });
      if (data) setResults(data as unknown as PublicPollResults);
    } catch {
      /* keep the last-known tally */
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) {
      setError('Please enter your name.');
      return;
    }
    const answers: SubmitPollAnswer[] = config.questions
      .map((q) => ({
        questionId: q.id,
        optionIds: fd.getAll(`q_${q.id}`).filter((v): v is string => typeof v === 'string'),
      }))
      .filter((a) => a.optionIds.length > 0);
    const turnstileToken = fd.get('cf-turnstile-response');

    startTransition(async () => {
      const result = await submitPollResponseAction({
        code: config.shortCode,
        name,
        answers,
        turnstileToken: typeof turnstileToken === 'string' ? turnstileToken : null,
      });
      // The token just got redeemed (pass or fail) — swap in a fresh widget so a
      // retry / "change my answer" doesn't reuse it (Cloudflare timeout-or-duplicate).
      setTurnstileKey((k) => k + 1);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Persist for cross-visit restore; the store update flips us to the tally.
      persistSubmission(config.id, {
        name,
        answers: Object.fromEntries(answers.map((a) => [a.questionId, a.optionIds])),
      });
      setManualForm(false);
      await refreshResults();
    });
  }

  const total = results?.totalRespondents ?? 0;

  return (
    <div className="space-y-6">
      {showForm ? (
        <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
          {error && <Alert variant="error">{error}</Alert>}

          {config.questions.map((q) => (
            <fieldset key={q.id} className="space-y-2">
              <legend className="text-fg font-medium">
                {q.prompt}
                {q.required && <span className="text-md-error"> *</span>}
                {q.kind === 'multi' && (
                  <span className="text-muted text-xs font-normal"> (pick any)</span>
                )}
              </legend>
              <div className="space-y-1.5">
                {q.options.map((o) => (
                  <label
                    key={o.id}
                    className="border-border-base hover:bg-md-surface-container-high flex cursor-pointer items-center gap-3 rounded-md border p-3"
                  >
                    <input
                      type={q.kind === 'single' ? 'radio' : 'checkbox'}
                      name={`q_${q.id}`}
                      value={o.id}
                      required={q.kind === 'single' && q.required}
                      defaultChecked={stored?.answers[q.id]?.includes(o.id) ?? false}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div>
            <label htmlFor="responder-name" className={fieldLabelClass}>
              Your name
            </label>
            <input
              id="responder-name"
              name="name"
              className={fieldInputClass}
              maxLength={120}
              autoComplete="name"
              defaultValue={stored?.name ?? ''}
              placeholder="First name is fine"
            />
          </div>

          <TurnstileWidget key={turnstileKey} />

          <div className="flex items-center gap-3">
            <button type="submit" className={primaryButtonClass('md')} disabled={pending}>
              {pending ? 'Submitting…' : stored ? 'Update my answer' : 'Submit'}
            </button>
            {stored && (
              <button
                type="button"
                className={textButtonClass('md')}
                onClick={() => setManualForm(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          {!isClosed && stored && <Alert variant="success">Thanks — your response is in!</Alert>}
          {isClosed && <Alert variant="info">This poll is closed. Here are the results.</Alert>}

          <div className="space-y-6">
            {config.questions.map((q) => {
              const counts = q.options.map((o) => results?.options[o.id]?.count ?? 0);
              const max = counts.reduce((m, c) => Math.max(m, c), 0);
              return (
                <div key={q.id} className="space-y-3">
                  <p className="text-fg font-medium">{q.prompt}</p>
                  <div className="space-y-2">
                    {q.options.map((o, oi) => {
                      const opt = results?.options[o.id];
                      const count = counts[oi] ?? 0;
                      const mine = stored?.answers[q.id]?.includes(o.id) ?? false;
                      return (
                        <div key={o.id}>
                          <div className="mb-0.5 flex items-center justify-between text-sm">
                            <span>
                              {o.label}
                              {mine && <span className="text-primary"> · your pick</span>}
                            </span>
                            <span className="text-muted tabular-nums">{count}</span>
                          </div>
                          <div className="bg-md-surface-container-high h-2 w-full overflow-hidden rounded-full">
                            <div
                              className="bg-primary h-full rounded-full"
                              style={{ width: max > 0 ? `${(count / max) * 100}%` : '0%' }}
                            />
                          </div>
                          {config.showRespondentNames && opt?.names && opt.names.length > 0 && (
                            <p className="text-muted mt-1 text-xs">{opt.names.join(', ')}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-muted text-sm">
            {total} {total === 1 ? 'response' : 'responses'} so far.
          </p>

          {!isClosed && stored && (
            <button
              type="button"
              className={textButtonClass('md')}
              onClick={() => setManualForm(true)}
            >
              Change my answer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
