import type { AwardCategory, EventAwards, MediaPostItem } from '@pickupvb/domain';

const CATEGORIES: ReadonlyArray<{ key: AwardCategory; emoji: string; label: string }> = [
  { key: 'best_clip', emoji: '🏆', label: 'Best clip' },
  { key: 'biggest_fail', emoji: '💀', label: 'Biggest fail' },
];

/**
 * Live community-awards leaderboard: top 3 clips per category by vote count.
 * Renders nothing until at least one vote exists. Counts come from the same
 * `awards` payload the clip cards use, so it's a pure derivation — no extra
 * fetch. Voting itself happens on the clip cards below.
 */
export function AwardsLeaderboard({
  clips,
  awards,
}: {
  clips: MediaPostItem[];
  awards: EventAwards;
}) {
  const totalVotes = Object.values(awards.counts).reduce(
    (sum, c) => sum + c.best_clip + c.biggest_fail,
    0,
  );
  if (totalVotes === 0) return null;

  return (
    <section className="border-border-base rounded-shape-sm border p-4">
      <h2 className="text-fg text-lg font-semibold">🏅 Community awards</h2>
      <p className="text-muted text-xs">Live tally — vote on any clip below.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {CATEGORIES.map((cat) => {
          const ranked = clips
            .map((clip) => ({ clip, votes: awards.counts[clip.id]?.[cat.key] ?? 0 }))
            .filter((r) => r.votes > 0)
            .sort((a, b) => b.votes - a.votes)
            .slice(0, 3);
          return (
            <div key={cat.key}>
              <h3 className="text-fg text-sm font-semibold">
                {cat.emoji} {cat.label}
              </h3>
              {ranked.length === 0 ? (
                <p className="text-muted text-xs">No votes yet.</p>
              ) : (
                <ol className="mt-1 space-y-1">
                  {ranked.map((r, i) => (
                    <li key={r.clip.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        <span className="text-muted">{i + 1}.</span> {r.clip.title}{' '}
                        <span className="text-muted text-xs">· {r.clip.submitter.displayName}</span>
                      </span>
                      <span className="text-fg shrink-0 font-medium">{r.votes}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
