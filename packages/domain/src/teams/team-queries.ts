/**
 * Read-side port for the public teams directory (mirrors `ProfileQueries` /
 * `GroupQueries`). The `/teams` discover listing was previously a raw inline
 * `supabase.from('teams')` query in the page (teams-page-ux TM-4); this gives
 * that read a home + a test seam, and is where the roster-size projection
 * (TM-1) lives.
 *
 * Adapters take the caller's client so the read runs under the same auth/RLS
 * context the call site already had (the anon directory page, the viewer's
 * session, …).
 */
export interface TeamQueries {
  /** Paginated, counted, name-ordered public team directory (the `/teams` discover listing). */
  searchDirectory(query: TeamDirectoryQuery): Promise<TeamDirectoryPage>;
}

export interface TeamDirectoryQuery {
  /** Case-insensitive substring match on team name (raw text; adapter escapes). */
  nameLike?: string;
  /** Page size. */
  limit: number;
  /** Zero-based row offset for the page. */
  offset: number;
}

export interface TeamDirectoryPage {
  cards: TeamDirectoryCard[];
  /** Total teams matching the filters (across all pages). */
  total: number;
}

/** A public team card for the discover listing — the roster signal (TM-1). */
export interface TeamDirectoryCard {
  id: string;
  slug: string;
  name: string;
  captainId: string;
  /** Captain's public display name (resolved via `ProfileQueries`), null if unknown. */
  captainName: string | null;
  /** Active roster size + off-site extras — how many players are on the roster. */
  rosterCount: number;
}
