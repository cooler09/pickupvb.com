/**
 * Display-name helpers shared across the player surfaces — the public profile
 * (`/players/[id]`), the players directory (`/players`), and the profile hub's
 * identity hero. They take a raw `display_name` (the column can be null on a
 * freshly-seeded row), so callers pass the value directly without pre-coalescing.
 *
 * Consolidates three prior copies that disagreed on the single-word case
 * (the hub showed one letter, the public/directory cards two) — public-profile
 * audit PUB-4. The two-letter form wins, so a player's avatar initials now
 * match between their hub and their public card.
 */
export function playerName(displayName: string | null | undefined): string {
  return displayName?.trim() || 'Player';
}

export function playerInitials(displayName: string | null | undefined): string {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() || '?';
}
