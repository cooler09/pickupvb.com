'use client';

import { useState, useTransition, type ChangeEvent } from 'react';
import Link from 'next/link';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import { primaryButtonClass, secondaryButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
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

  // Import in client-driven chunks: each call handles a small slice so a large
  // file can't blow the server-action timeout, and the progress bar advances per
  // chunk. The server upsert is idempotent on externalUrl, so a mid-run failure
  // leaves the succeeded rows saved and a retry won't duplicate them.
  function runImport() {
    if (!drafts) return;
    const toImport = drafts;
    const BATCH_SIZE = 8;
    setError(null);
    setProgress({ done: 0, total: toImport.length });
    startTransition(async () => {
      const all: ImportRowResult[] = [];
      for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
        const batch = toImport.slice(i, i + BATCH_SIZE);
        const res = await importAction(batch);
        if (!res.ok) {
          setError(res.error);
          setProgress(null);
          if (all.length > 0) setResults(all);
          return;
        }
        all.push(...res.results);
        setProgress({ done: Math.min(i + BATCH_SIZE, toImport.length), total: toImport.length });
      }
      setResults(all);
      setProgress(null);
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
    setProgress(null);
    setJsonText('');
  }

  return (
    <div className="space-y-6">
      {error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {/* Step 3 — results. Surface created/updated/failed prominently; tuck the
          "unchanged" rows (no edits needed) behind a disclosure so you only see
          what actually changed. */}
      {results &&
        (() => {
          const nCreated = results.filter((r) => r.ok && r.action === 'created').length;
          const nUpdated = results.filter((r) => r.ok && r.action === 'updated').length;
          const unchanged = results.filter((r) => r.ok && r.action === 'unchanged');
          const nErrors = results.filter((r) => !r.ok).length;
          const changedOrFailed = results.filter((r) => !r.ok || r.action !== 'unchanged');
          return (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Import results</h2>
              <p className="text-muted text-sm">
                {nCreated} created · {nUpdated} updated · {unchanged.length} unchanged
                {nErrors > 0 ? ` · ${nErrors} failed` : ''}
              </p>
              {changedOrFailed.length > 0 && (
                <ul className="space-y-2">{changedOrFailed.map(resultRow)}</ul>
              )}
              {changedOrFailed.length === 0 && (
                <p className="bg-md-surface-container text-muted rounded-md p-3 text-sm">
                  Everything was already up to date — nothing to write.
                </p>
              )}
              {unchanged.length > 0 && (
                <details className="text-sm">
                  <summary className="text-muted cursor-pointer">
                    {unchanged.length} unchanged — no edits needed
                  </summary>
                  <ul className="mt-2 space-y-1">{unchanged.map(resultRow)}</ul>
                </details>
              )}
              <div className="flex gap-3">
                <Link href="/community" className={primaryButtonClass('md')}>
                  Go to community listings
                </Link>
                <button type="button" onClick={reset} className={secondaryButtonClass('md')}>
                  Import more
                </button>
              </div>
            </div>
          );
        })()}

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
            <div className="space-y-2">
              <button
                type="button"
                onClick={runImport}
                disabled={pending}
                className={primaryButtonClass('md')}
              >
                {pending
                  ? progress
                    ? `Importing… ${progress.done} / ${progress.total}`
                    : 'Importing…'
                  : `Import ${drafts.length} listing${drafts.length === 1 ? '' : 's'}`}
              </button>
              {pending && progress && (
                <div className="bg-fg/10 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full transition-all"
                    style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One row in the import-results list. */
function resultRow(r: ImportRowResult, i: number) {
  if (!r.ok) {
    return (
      <li
        key={i}
        className="border-md-error/30 bg-md-error-container rounded-md border p-3 text-sm"
      >
        <span className="font-medium">{r.title}</span>
        <span className="text-md-on-error-container"> — {r.error}</span>
      </li>
    );
  }
  if (r.action === 'unchanged') {
    return (
      <li key={i} className="border-border-base bg-fg/5 rounded-md border p-2 text-sm">
        <span className="font-medium">{r.title}</span>
        <span className="text-muted"> — unchanged</span>
      </li>
    );
  }
  return (
    <li
      key={i}
      className="border-md-success/30 bg-md-success-container rounded-md border p-3 text-sm"
    >
      <span className="font-medium">{r.title}</span>
      {r.action === 'created' ? ' — created · ' : ' — updated · '}
      <Link href={`/community/${r.slug}`} className="text-primary underline">
        view
      </Link>
      {!r.geocoded && (
        <span className="text-md-warning mt-1 block text-xs">
          Saved with the address as text — it didn&rsquo;t geocode, so it won&rsquo;t show on the
          map or in distance search until coordinates are added.
        </span>
      )}
      {r.hidden && (
        <span className="text-md-warning mt-1 block text-xs">
          This listing is currently <strong>hidden</strong> — it won&rsquo;t appear publicly until
          you un-hide it from its page.
        </span>
      )}
    </li>
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
  // Collapsed by default so a 150-row review is a scannable list of summary rows,
  // not a wall of forms. Expand a card to edit it.
  const [open, setOpen] = useState(false);
  const place = [draft.city, draft.region].filter(Boolean).join(', ');
  const summary =
    [
      draft.startsAtLocal ? draft.startsAtLocal.slice(0, 10) : null,
      place || null,
      draft.allDay ? 'time TBD' : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'no date set';

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
    <fieldset className="border-border-base bg-md-surface-container rounded-md border">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <svg
            viewBox="0 0 20 20"
            className={`size-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 5l6 5-6 5V5z" />
          </svg>
          <span className="min-w-0">
            <span className="block truncate font-medium">{draft.title || '(untitled)'}</span>
            <span className="text-muted block truncate text-xs">{summary}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted hover:text-md-error shrink-0 text-sm"
        >
          Remove
        </button>
      </div>

      {open && (
        <div className="border-border-base space-y-4 border-t p-4">
          <div>
            <label className={labelClass}>Title</label>
            <input
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className={inputClass}
            />
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
                disabled={draft.allDay}
                className={`${inputClass} disabled:opacity-50`}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(e) => onChange({ allDay: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              All day / time TBD
              <span className="text-muted block text-xs">
                Show only the date — use this when the source publishes a date but no start time.
                The clock time above is ignored (anchored to noon) and the end time is dropped.
              </span>
            </span>
          </label>

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
        </div>
      )}
    </fieldset>
  );
}
