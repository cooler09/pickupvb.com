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

    useEffect(() => {
        if (query.trim().length < 3) {
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
                const res = await fetch(
                    `/api/geocode/autocomplete?q=${encodeURIComponent(query)}`,
                    { signal: ctrl.signal },
                );
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
        }, 250);

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
            />
            {loading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg/50">
                    …
                </span>
            )}
            {open && suggestions.length > 0 && (
                <ul
                    id="address-suggestions"
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-md border border-border-base bg-surface py-1 text-sm shadow-lg"
                >
                    {suggestions.map((s, idx) => (
                        <li
                            key={`${s.latitude},${s.longitude},${idx}`}
                            role="option"
                            aria-selected={idx === activeIdx}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                pick(s);
                            }}
                            onMouseEnter={() => setActiveIdx(idx)}
                            className={`cursor-pointer px-3 py-2 ${idx === activeIdx ? 'bg-primary/10 text-primary' : 'hover:bg-fg/5'
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
