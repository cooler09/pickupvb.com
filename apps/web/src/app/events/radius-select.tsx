'use client';

import { useTransition, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';

const RADII_KM = [10, 25, 40, 80, 160];

/**
 * Radius control for location-filtered list views (the /players directory).
 * Renders inline on the active-location line and re-navigates on change so a
 * user can widen / narrow a "near me" search — the knob the filtered
 * empty-state's "widen your radius" copy promises (players-page-ux PL-9).
 * Mirrors {@link NearMeButton} / {@link LocationSearch}: preserves the other
 * active filters via `URLSearchParams` and resets pagination.
 *
 * Compact, inline filter-line control — a deliberate opt-out from the
 * `fieldInputClass` chassis (AGENTS pattern 11 sanctions a "filter-bar select"
 * having its own class), styled with the same field tokens at a smaller scale.
 */
export function RadiusSelect({ basePath, value }: { basePath: Route; value: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  // Always include the active value so a URL-set radius outside the preset list
  // still shows as the selected option.
  const options = Array.from(new Set([...RADII_KM, value])).sort((a, b) => a - b);

  function onChange(e: ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('radiusKm', e.target.value);
    params.delete('page');
    start(() => router.push(`${basePath}?${params.toString()}` as Route));
  }

  return (
    <select
      aria-label="Search radius"
      defaultValue={value}
      onChange={onChange}
      disabled={pending}
      className="border-border-base bg-md-surface-container focus:border-primary focus-visible:ring-primary rounded-md border px-2 py-1 text-xs shadow-sm focus:outline-none focus-visible:ring-2 disabled:opacity-60"
    >
      {options.map((r) => (
        <option key={r} value={r}>
          within {r} km
        </option>
      ))}
    </select>
  );
}
