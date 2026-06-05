'use client';

import { useState, useTransition, type ChangeEvent } from 'react';
import Link from 'next/link';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import { primaryButtonClass, secondaryButtonClass } from '@/components/primary-button';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';
import { importAction, type ImportRowResult } from './actions';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { parseDraftsJson, type ListingDraft } from '@/lib/listing-draft';

const SURFACES = [
  ['', 'Any'],
  ['indoor', 'Indoor'],
  ['grass', 'Grass'],
  ['sand', 'Sand'],
] as const;
const FORMATS = [
  ['', 'Any'],
  ['sixes', 'Sixes'],
  ['quads', 'Quads'],
  ['triples', 'Triples'],
  ['doubles', 'Doubles'],
] as const;
const SKILLS = [
  ['', 'Any'],
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
  ['competitive', 'Competitive'],
] as const;

export default function ImportClient() {
  const [jsonText, setJsonText] = useState('');
  const [drafts, setDrafts] = useState<ListingDraft[] | null>(null);
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errorRef = useAlertReveal(error, Boolean(error));

  function loadDrafts(text: string) {
    setError(null);
    setResults(null);
    try {
      setDrafts(parseDraftsJson(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that JSON.');
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then(loadDrafts);
    // Reset the input so re-selecting the same file fires onChange again.
    e.target.value = '';
  }

  function runImport() {
    if (!drafts) return;
    setError(null);
    startTransition(async () => {
      const res = await importAction(drafts);
      if (res.ok) setResults(res.results);
      else setError(res.error);
    });
  }

  function updateDraft(index: number, patch: Partial<ListingDraft>) {
    setDrafts((cur) => cur && cur.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function removeDraft(index: number) {
    setDrafts((cur) => cur && cur.filter((_, i) => i !== index));
  }

  function reset() {
    setDrafts(null);
    setResults(null);
    setError(null);
    setJsonText('');
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 outline-none"
        >
          {error}
        </div>
      )}

      {/* Step 3 — results */}
      {results && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Import results</h2>
          <ul className="space-y-2">
            {results.map((r, i) => (
              <li
                key={i}
                className={`rounded-md border p-3 text-sm ${
                  r.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}
              >
                <span className="font-medium">{r.title}</span>
                {r.ok ? (
                  <>
                    {' — created · '}
                    <Link href={`/community/${r.slug}`} className="text-primary underline">
                      view
                    </Link>
                    {!r.geocoded && (
                      <span className="mt-1 block text-xs text-amber-700">
                        Saved with the address as text — it didn&rsquo;t geocode, so it won&rsquo;t
                        show on the map or in distance search until coordinates are added.
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-red-700"> — {r.error}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <Link href="/community" className={primaryButtonClass('md')}>
              Go to community listings
            </Link>
            <button type="button" onClick={reset} className={secondaryButtonClass('md')}>
              Import more
            </button>
          </div>
        </div>
      )}

      {/* Step 1 — upload the JSON produced by the skill */}
      {!drafts && !results && (
        <div className="space-y-4">
          <div>
            <label htmlFor="jsonFile" className={labelClass}>
              Upload listings JSON
            </label>
            <p className="text-muted mt-1 text-xs">
              Generate the file with the{' '}
              <code className="bg-fg/5 rounded px-1">facebook-events-import</code> Claude Code
              skill, then upload it here. Every entry is a draft you review and fix before anything
              is saved; geocoding and timezone are resolved server-side on import.
            </p>
            <input
              id="jsonFile"
              type="file"
              accept="application/json,.json"
              onChange={onFile}
              className="text-muted file:bg-fg/10 file:text-fg mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-sm hover:file:cursor-pointer"
            />
          </div>

          <details className="text-sm">
            <summary className="text-muted cursor-pointer">…or paste JSON directly</summary>
            <div className="mt-3 space-y-3">
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={10}
                className={inputClass}
                placeholder={
                  '[{"title":"Saturday Beach Doubles","externalUrl":"https://www.facebook.com/events/123",' +
                  '"startsAtLocal":"2026-07-11T09:00","city":"Erie","region":"PA","country":"United States",' +
                  '"surface":"sand","format":"doubles"}]'
                }
              />
              <button
                type="button"
                onClick={() => loadDrafts(jsonText)}
                disabled={jsonText.trim().length === 0}
                className={primaryButtonClass('md')}
              >
                Load drafts
              </button>
            </div>
          </details>
        </div>
      )}

      {/* Step 2 — review */}
      {drafts && !results && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Review {drafts.length} listing{drafts.length === 1 ? '' : 's'}
            </h2>
            <button type="button" onClick={reset} className="text-muted hover:text-primary text-sm">
              Start over
            </button>
          </div>

          {drafts.length === 0 && (
            <p className="text-muted text-sm">No drafts left. Start over to paste again.</p>
          )}

          {drafts.map((d, i) => (
            <DraftCard
              key={i}
              draft={d}
              onChange={(patch) => updateDraft(i, patch)}
              onRemove={() => removeDraft(i)}
            />
          ))}

          {drafts.length > 0 && (
            <button
              type="button"
              onClick={runImport}
              disabled={pending}
              className={primaryButtonClass('md')}
            >
              {pending
                ? 'Importing…'
                : `Import ${drafts.length} listing${drafts.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  onChange,
  onRemove,
}: {
  draft: ListingDraft;
  onChange: (patch: Partial<ListingDraft>) => void;
  onRemove: () => void;
}) {
  function applySuggestion(s: Suggestion) {
    onChange({
      addressLine: s.addressLine || null,
      city: s.city || null,
      region: s.region || null,
      postalCode: s.postalCode || null,
      country: s.country || null,
    });
  }

  return (
    <fieldset className="border-border-base bg-surface space-y-4 rounded-md border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <label className={labelClass}>Title</label>
          <input
            value={draft.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className={inputClass}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted mt-7 shrink-0 text-sm hover:text-red-600"
        >
          Remove
        </button>
      </div>

      <div>
        <label className={labelClass}>External URL</label>
        <input
          value={draft.externalUrl}
          onChange={(e) => onChange({ externalUrl: e.target.value })}
          placeholder="https://www.facebook.com/events/..."
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Hosted by</label>
          <input
            value={draft.externalHostName ?? ''}
            onChange={(e) => onChange({ externalHostName: e.target.value || null })}
            className={inputClass}
          />
        </div>
        <div />
        <div>
          <label className={labelClass}>Starts</label>
          <input
            type="datetime-local"
            value={draft.startsAtLocal}
            onChange={(e) => onChange({ startsAtLocal: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Ends (optional)</label>
          <input
            type="datetime-local"
            value={draft.endsAtLocal ?? ''}
            onChange={(e) => onChange({ endsAtLocal: e.target.value || null })}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Search address (optional)</label>
        <AddressAutocomplete onPick={applySuggestion} inputClass={inputClass} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>Street</label>
          <input
            value={draft.addressLine ?? ''}
            onChange={(e) => onChange({ addressLine: e.target.value || null })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>City</label>
          <input
            value={draft.city ?? ''}
            onChange={(e) => onChange({ city: e.target.value || null })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>State / region</label>
          <input
            value={draft.region ?? ''}
            onChange={(e) => onChange({ region: e.target.value || null })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Postal code</label>
          <input
            value={draft.postalCode ?? ''}
            onChange={(e) => onChange({ postalCode: e.target.value || null })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Country</label>
          <input
            value={draft.country ?? ''}
            onChange={(e) => onChange({ country: e.target.value || null })}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Surface</label>
          <select
            value={draft.surface ?? ''}
            onChange={(e) =>
              onChange({ surface: (e.target.value || null) as ListingDraft['surface'] })
            }
            className={inputClass}
          >
            {SURFACES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Format</label>
          <select
            value={draft.format ?? ''}
            onChange={(e) =>
              onChange({ format: (e.target.value || null) as ListingDraft['format'] })
            }
            className={inputClass}
          >
            {FORMATS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Skill</label>
          <select
            value={draft.skillLevel ?? ''}
            onChange={(e) =>
              onChange({ skillLevel: (e.target.value || null) as ListingDraft['skillLevel'] })
            }
            className={inputClass}
          >
            {SKILLS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Description (optional)</label>
        <textarea
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </div>
    </fieldset>
  );
}
