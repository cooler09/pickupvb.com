'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/alert';
import {
  fieldHintClass,
  fieldInputClass,
  fieldLabelClass,
  fieldSubLabelClass,
} from '@/components/field-styles';
import {
  neutralButtonClass,
  primaryButtonClass,
  errorTextButtonClass,
  textButtonClass,
} from '@/components/primary-button';
import { createPollAction, updatePollAction } from '../actions';
import type { PollFormValues, PollQuestionDraftUI, PollQuestionKind } from './poll-form-types';

function emptyQuestion(): PollQuestionDraftUI {
  return { prompt: '', kind: 'single', required: true, options: [{ label: '' }, { label: '' }] };
}

const BLANK: PollFormValues = {
  title: '',
  description: '',
  closesAt: '',
  showRespondentNames: true,
  questions: [emptyQuestion()],
};

export interface PollBuilderProps {
  mode: 'create' | 'edit';
  eventId?: string | null;
  groupId?: string | null;
  pollId?: string;
  initialValues?: PollFormValues;
  /** Edit mode with responses already in — questions can't be restructured. */
  structuralLocked?: boolean;
}

/**
 * Host builder for a multi-question poll (ADR 0041). Client component: manages
 * the nested question/option state and calls the create/update server actions
 * with the structured values. In edit mode with responses, the question
 * structure is read-only (a full-replace would cascade-delete answers), so only
 * metadata is editable.
 */
export function PollBuilder({
  mode,
  eventId = null,
  groupId = null,
  pollId,
  initialValues,
  structuralLocked = false,
}: PollBuilderProps) {
  const [values, setValues] = useState<PollFormValues>(initialValues ?? BLANK);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patch(next: Partial<PollFormValues>) {
    setValues((v) => ({ ...v, ...next }));
  }

  function patchQuestion(qi: number, next: Partial<PollQuestionDraftUI>) {
    setValues((v) => ({
      ...v,
      questions: v.questions.map((q, i) => (i === qi ? { ...q, ...next } : q)),
    }));
  }

  function setOptionLabel(qi: number, oi: number, label: string) {
    setValues((v) => ({
      ...v,
      questions: v.questions.map((q, i) =>
        i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? { label } : o)) } : q,
      ),
    }));
  }

  function addOption(qi: number) {
    patchQuestion(qi, { options: [...values.questions[qi]!.options, { label: '' }] });
  }

  function removeOption(qi: number, oi: number) {
    patchQuestion(qi, { options: values.questions[qi]!.options.filter((_, j) => j !== oi) });
  }

  function addQuestion() {
    patch({ questions: [...values.questions, emptyQuestion()] });
  }

  function removeQuestion(qi: number) {
    patch({ questions: values.questions.filter((_, i) => i !== qi) });
  }

  function normalize(): PollFormValues | null {
    const title = values.title.trim();
    if (!title) {
      setError('Give your poll a title.');
      return null;
    }
    const questions = values.questions
      .map((q) => ({
        ...q,
        prompt: q.prompt.trim(),
        options: q.options.map((o) => ({ label: o.label.trim() })).filter((o) => o.label),
      }))
      .filter((q) => q.prompt && q.options.length > 0);
    if (!structuralLocked && questions.length === 0) {
      setError('Add at least one question with an option.');
      return null;
    }
    return { ...values, title, description: values.description.trim(), questions };
  }

  function submit() {
    setError(null);
    const normalized = normalize();
    if (!normalized) return;
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createPollAction({ eventId, groupId, values: normalized })
          : await updatePollAction(pollId!, {
              values: normalized,
              includeQuestions: !structuralLocked,
            });
      // On success the action redirects; only failures return here.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}

      {/* ---- Metadata ---- */}
      <div className="space-y-4">
        <div>
          <label htmlFor="poll-title" className={fieldLabelClass}>
            Poll title
          </label>
          <input
            id="poll-title"
            className={fieldInputClass}
            value={values.title}
            maxLength={200}
            placeholder="Tuesday pickup — who’s coming?"
            onChange={(e) => patch({ title: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="poll-desc" className={fieldLabelClass}>
            Description <span className="text-muted">(optional)</span>
          </label>
          <textarea
            id="poll-desc"
            className={fieldInputClass}
            rows={2}
            value={values.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="poll-closes" className={fieldLabelClass}>
              Closes at <span className="text-muted">(optional)</span>
            </label>
            <input
              id="poll-closes"
              type="datetime-local"
              className={fieldInputClass}
              value={values.closesAt}
              onChange={(e) => patch({ closesAt: e.target.value })}
            />
            <p className={fieldHintClass}>Responses are locked after this time.</p>
          </div>
          <label className="flex items-start gap-2 pt-7">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={values.showRespondentNames}
              onChange={(e) => patch({ showRespondentNames: e.target.checked })}
            />
            <span>
              <span className={fieldSubLabelClass}>Show respondent names publicly</span>
              <span className={fieldHintClass}>
                Off = the public page shows counts only. You always see names.
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* ---- Questions ---- */}
      <div className="space-y-4">
        <h2 className="text-title-lg font-semibold">Questions</h2>
        {structuralLocked && (
          <Alert variant="info">
            People have already responded, so questions can’t be changed. You can still edit the
            title, close time, and name visibility above.
          </Alert>
        )}

        {values.questions.map((q, qi) => (
          <div
            key={qi}
            className="border-border-base bg-md-surface-container space-y-3 rounded-md border p-4"
          >
            <div className="flex items-start gap-2">
              <input
                className={`${fieldInputClass} mt-0!`}
                value={q.prompt}
                maxLength={300}
                placeholder={`Question ${qi + 1}`}
                disabled={structuralLocked}
                onChange={(e) => patchQuestion(qi, { prompt: e.target.value })}
              />
              {!structuralLocked && values.questions.length > 1 && (
                <button
                  type="button"
                  className={errorTextButtonClass('sm')}
                  onClick={() => removeQuestion(qi)}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <span className={fieldSubLabelClass}>Type</span>
                <select
                  className={`${fieldInputClass} mt-0! w-auto`}
                  value={q.kind}
                  disabled={structuralLocked}
                  onChange={(e) => patchQuestion(qi, { kind: e.target.value as PollQuestionKind })}
                >
                  <option value="single">Pick one</option>
                  <option value="multi">Pick many</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={q.required}
                  disabled={structuralLocked}
                  onChange={(e) => patchQuestion(qi, { required: e.target.checked })}
                />
                <span>Required</span>
              </label>
            </div>

            <div className="space-y-2">
              {q.options.map((o, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    className={`${fieldInputClass} mt-0!`}
                    value={o.label}
                    maxLength={200}
                    placeholder={`Option ${oi + 1}`}
                    disabled={structuralLocked}
                    onChange={(e) => setOptionLabel(qi, oi, e.target.value)}
                  />
                  {!structuralLocked && q.options.length > 1 && (
                    <button
                      type="button"
                      className={errorTextButtonClass('sm')}
                      onClick={() => removeOption(qi, oi)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {!structuralLocked && (
                <button
                  type="button"
                  className={textButtonClass('sm')}
                  onClick={() => addOption(qi)}
                >
                  + Add option
                </button>
              )}
            </div>
          </div>
        ))}

        {!structuralLocked && (
          <button type="button" className={neutralButtonClass('sm')} onClick={addQuestion}>
            + Add question
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className={primaryButtonClass('md')}
          disabled={pending}
          onClick={submit}
        >
          {pending ? 'Saving…' : mode === 'create' ? 'Create poll' : 'Save changes'}
        </button>
        <Link
          href={mode === 'edit' && pollId ? `/polls/${pollId}` : '/polls'}
          className={textButtonClass('md')}
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
