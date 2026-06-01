'use server';

import { geocodePlace } from '@/lib/geocode';

/**
 * Geocode a free-text city/ZIP for the events-list location search.
 * Returns the coordinates or null (not found / transient failure) — the client
 * shows a "couldn't find that place" toast on null. Kept deliberately simple
 * (no typed error) because it's invoked from a `'use client'` search box, not a
 * required form submission like event create/edit.
 */
export async function geocodePlaceAction(
  query: string,
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    return await geocodePlace(query);
  } catch {
    return null;
  }
}
