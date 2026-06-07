/**
 * Read-only league standings table for the season hub. Server-rendered and
 * viewer-independent (it only reads recorded match results), so it lives in
 * `page.tsx` outside the `<ScheduleWorkspace>` client island — every viewer
 * sees the same table and it stays cacheable (performance audit P2 #14).
 *
 * Rows are computed by `computeLeagueStandings` (domain) and name-resolved at
 * the page boundary. League matches carry a single score per match (no
 * set-by-set rows), so PF/PA are whatever the host records — sets won (2–1)
 * or rally points (25–20) — and feed only the differential tiebreaker.
 */
export type LeagueStandingRow = {
  rank: number;
  entryId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
};

export function StandingsSection({ rows }: { rows: ReadonlyArray<LeagueStandingRow> }) {
  return (
    <section aria-labelledby="standings-heading" className="space-y-2">
      <h2 id="standings-heading" className="text-fg text-base font-semibold">
        Standings
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted text-sm">Standings appear once matches are on the slate.</p>
      ) : (
        <>
          <div className="border-border-base rounded-shape-sm overflow-x-auto border">
            <table className="w-full text-sm">
              <thead className="bg-fg/5 text-muted text-xs tracking-wide uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    #
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Team
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Pld
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    W
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    L
                  </th>
                  <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                    PF
                  </th>
                  <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                    PA
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Diff
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border-base divide-y">
                {rows.map((r) => (
                  <tr key={r.entryId}>
                    <td className="text-muted px-3 py-2 tabular-nums">{r.rank}</td>
                    <td className="text-fg px-3 py-2 font-medium">{r.name}</td>
                    <td className="text-muted px-2 py-2 text-right tabular-nums">{r.played}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.wins}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.losses}</td>
                    <td className="text-muted hidden px-2 py-2 text-right tabular-nums sm:table-cell">
                      {r.pointsFor}
                    </td>
                    <td className="text-muted hidden px-2 py-2 text-right tabular-nums sm:table-cell">
                      {r.pointsAgainst}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted text-xs">
            Ranked by wins, then score differential. PF/PA reflect the scores the host records (sets
            or points).
          </p>
        </>
      )}
    </section>
  );
}
