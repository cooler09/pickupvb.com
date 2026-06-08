'use client';

import { useEffect, useRef, useState } from 'react';

export type Suggestion = {
  label: string;
  addressLine: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
};

type Props = {
  onPick: (s: Suggestion) => void;
  inputClass: string;
};

export default function AddressAutocomplete({ onPick, inputClass }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch driven by `query`. The setState calls inside this
  // effect are intentional — the result of an async request lands in
  // component state. `react-hooks/set-state-in-effect` flags the
  // synchronous empty-query clears below; the rule has no cleaner
  // primitive for "debounce + fetch + display".
  useEffect(() => {
    if (query.trim().length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale results when input drops below the min length
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode/autocomplete?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions);
        setOpen(true);
        setActiveIdx(-1);
      } catch {
        // aborted or network
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function pick(s: Suggestion) {
    onPick(s);
    setQuery(s.label);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0) {
        e.preventDefault();
        const picked = suggestions[activeIdx];
        if (picked) pick(picked);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id="addressSearch"
        type="text"
        placeholder="Start typing an address or venue…"
        aria-label="Search for an address or venue"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        className={inputClass}
        role="combobox"
        aria-expanded={open}
        aria-controls="address-suggestions"
        aria-autocomplete="list"
        {...(open && activeIdx >= 0
          ? { 'aria-activedescendant': `address-suggestion-${activeIdx}` }
          : {})}
      />
      {loading && (
        <span className="text-fg/50 absolute top-1/2 right-3 -translate-y-1/2 text-xs">…</span>
      )}
      {/* Live status — announced by screen readers as results arrive. */}
      <p className="sr-only" aria-live="polite" role="status">
        {loading
          ? 'Searching…'
          : open && suggestions.length === 0 && query.trim().length >= 3
            ? 'No matches.'
            : open && suggestions.length > 0
              ? `${suggestions.length} ${suggestions.length === 1 ? 'suggestion' : 'suggestions'} available. Use arrow keys to navigate.`
              : ''}
      </p>
      {open && suggestions.length > 0 && (
        <ul
          id="address-suggestions"
          role="listbox"
          className="border-border-base bg-md-surface-container absolute top-full right-0 left-0 z-40 mt-1 max-h-72 overflow-auto overscroll-contain rounded-md border py-1 text-sm shadow-lg"
        >
          {suggestions.map((s, idx) => (
            <li
              key={`${s.latitude},${s.longitude},${idx}`}
              id={`address-suggestion-${idx}`}
              role="option"
              aria-selected={idx === activeIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`cursor-pointer px-3 py-2 ${
                idx === activeIdx ? 'bg-primary/10 text-primary' : 'hover:bg-fg/5'
              }`}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
