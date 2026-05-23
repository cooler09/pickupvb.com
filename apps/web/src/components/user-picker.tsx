'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import { searchPeople, type PeopleSearchResult } from '@/app/people-actions';

type Props = {
  /** Name of the hidden form field that carries the chosen user id. */
  name: string;
  /** Visible label shown above the input. */
  label?: string;
  placeholder?: string;
  /** Required for native form validation. */
  required?: boolean;
  /** Optional hint shown under the input when nothing is selected. */
  helperText?: string;
  /** Ids that should be filtered out of search results (already-added
   *  members, the viewer themselves, etc.). */
  excludeIds?: ReadonlyArray<string>;
};

/**
 * Typeahead picker for selecting a user by name. Renders a search input plus
 * a hidden `<input name={name}>` that holds the chosen user's id. After the
 * user picks a result, the search input becomes a "chip" with a clear button
 * so they can re-select.
 *
 * Talks to the `searchPeople` server action — debounced, min 2 chars.
 */
export function UserPicker({
  name,
  label = 'Find a player',
  placeholder = 'Search by name…',
  required,
  helperText,
  excludeIds,
}: Props) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const statusId = `${inputId}-status`;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PeopleSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PeopleSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const reqIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced people-search driven by `query`. The setState calls inside
  // are intentional (async fetch result → component state) and there's no
  // cleaner primitive for "debounce + fetch + display".
  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale results when input drops below the min length
      setResults([]);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const out = await searchPeople(q, excludeIds ? [...excludeIds] : []);
      // Stale-response guard: only commit if still the latest request.
      if (myReq === reqIdRef.current) {
        setResults(out);
        setLoading(false);
        setOpen(true);
        setActiveIdx(-1);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, selected, excludeIds]);

  // Close the popover on click outside. Replaces the older blur-timing
  // hack which could swallow keyboard activation and break some AT.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function optionId(idx: number): string {
    return `${inputId}-option-${idx}`;
  }

  function pick(r: PeopleSearchResult) {
    setSelected(r);
    setOpen(false);
    setActiveIdx(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0) {
        e.preventDefault();
        const picked = results[activeIdx];
        if (picked) pick(picked);
      }
    }
  }

  if (selected) {
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="text-fg block text-sm font-medium">
            {label}
          </label>
        )}
        <div className="border-border-base bg-surface flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="flex min-w-0 items-center gap-2">
            {selected.avatarUrl ? (
              <Image
                src={selected.avatarUrl}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="bg-primary/15 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              >
                {initials(selected.fullName)}
              </span>
            )}
            <span className="truncate text-sm font-medium">{selected.fullName}</span>
            {selected.homeCity && (
              <span className="text-muted truncate text-xs">· {selected.homeCity}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery('');
              setResults([]);
            }}
            className="text-muted hover:text-fg text-xs font-medium"
          >
            Change
          </button>
        </div>
        <input type="hidden" name={name} value={selected.id} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative space-y-1">
      {label && (
        <label htmlFor={inputId} className="text-fg block text-sm font-medium">
          {label}
        </label>
      )}
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        {...(open && activeIdx >= 0 ? { 'aria-activedescendant': optionId(activeIdx) } : {})}
        className="border-border-base bg-surface focus:border-primary focus-visible:ring-primary block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      />
      {/* Hidden field carries the value the form submits. Empty until a
       *  selection is made; the server action no-ops on empty input.
       *  (Browsers skip native `required` validation on hidden inputs,
       *  so we don't bother setting it here.) */}
      <input type="hidden" name={name} value="" />
      {required && (
        <p className="sr-only" role="status">
          A player must be selected before submitting.
        </p>
      )}
      {helperText && <p className="text-muted text-xs">{helperText}</p>}
      {/* Live status — announced by screen readers as results arrive. Kept
       *  outside the listbox so the listbox only contains options. */}
      <p id={statusId} className="sr-only" aria-live="polite" role="status">
        {loading
          ? 'Searching…'
          : open && query.trim().length >= 2 && results.length === 0
            ? 'No matches.'
            : open && results.length > 0
              ? `${results.length} ${results.length === 1 ? 'match' : 'matches'} available. Use arrow keys to navigate.`
              : ''}
      </p>
      {open && (results.length > 0 || (!loading && query.trim().length >= 2)) && (
        <ul
          id={listboxId}
          role="listbox"
          className="border-border-base bg-surface absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border shadow-lg"
        >
          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <li className="text-muted px-3 py-2 text-xs" role="presentation">
              No matches.
            </li>
          )}
          {results.map((r, idx) => (
            <li key={r.id} role="presentation">
              <button
                type="button"
                id={optionId(idx)}
                role="option"
                aria-selected={idx === activeIdx}
                onMouseDown={(e) => {
                  // mousedown so we beat the input's blur handler.
                  e.preventDefault();
                  pick(r);
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                aria-label={`Select ${r.fullName}${r.homeCity ? ` from ${r.homeCity}` : ''}`}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  idx === activeIdx ? 'bg-primary/10 text-primary' : 'hover:bg-fg/5'
                }`}
              >
                {r.avatarUrl ? (
                  <Image
                    src={r.avatarUrl}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="bg-primary/15 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  >
                    {initials(r.fullName)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.fullName}</span>
                  {r.homeCity && (
                    <span className="text-muted block truncate text-xs">{r.homeCity}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
