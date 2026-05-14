'use client';

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
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PeopleSearchResult[]>([]);
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<PeopleSearchResult | null>(null);
    const [loading, setLoading] = useState(false);
    const reqIdRef = useRef(0);

    useEffect(() => {
        if (selected) return;
        const q = query.trim();
        if (q.length < 2) {
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
            }
        }, 200);
        return () => clearTimeout(t);
    }, [query, selected, excludeIds]);

    if (selected) {
        return (
            <div className="space-y-1">
                {label && (
                    <label htmlFor={inputId} className="block text-sm font-medium text-fg">
                        {label}
                    </label>
                )}
                <div className="flex items-center justify-between gap-2 rounded-md border border-border-base bg-surface px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                        {selected.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={selected.avatarUrl}
                                alt=""
                                className="h-7 w-7 rounded-full object-cover"
                            />
                        ) : (
                            <span
                                aria-hidden="true"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                            >
                                {initials(selected.fullName)}
                            </span>
                        )}
                        <span className="truncate text-sm font-medium">{selected.fullName}</span>
                        {selected.homeCity && (
                            <span className="truncate text-xs text-muted">
                                · {selected.homeCity}
                            </span>
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            setSelected(null);
                            setQuery('');
                            setResults([]);
                        }}
                        className="text-xs font-medium text-muted hover:text-fg"
                    >
                        Change
                    </button>
                </div>
                <input type="hidden" name={name} value={selected.id} />
            </div>
        );
    }

    return (
        <div className="relative space-y-1">
            {label && (
                <label htmlFor={inputId} className="block text-sm font-medium text-fg">
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
                onBlur={() => {
                    // Delay so click on a result registers first.
                    setTimeout(() => setOpen(false), 120);
                }}
                className="block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
            {helperText && <p className="text-xs text-muted">{helperText}</p>}
            {open && (
                <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border-base bg-surface shadow-lg">
                    {loading && (
                        <li className="px-3 py-2 text-xs text-muted">Searching…</li>
                    )}
                    {!loading && results.length === 0 && query.trim().length >= 2 && (
                        <li className="px-3 py-2 text-xs text-muted">No matches.</li>
                    )}
                    {results.map((r) => (
                        <li key={r.id}>
                            <button
                                type="button"
                                onMouseDown={(e) => {
                                    // mousedown so we beat the input's blur handler.
                                    e.preventDefault();
                                    setSelected(r);
                                    setOpen(false);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-fg/5"
                            >
                                {r.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={r.avatarUrl}
                                        alt=""
                                        className="h-7 w-7 rounded-full object-cover"
                                    />
                                ) : (
                                    <span
                                        aria-hidden="true"
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                                    >
                                        {initials(r.fullName)}
                                    </span>
                                )}
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{r.fullName}</span>
                                    {r.homeCity && (
                                        <span className="block truncate text-xs text-muted">
                                            {r.homeCity}
                                        </span>
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
