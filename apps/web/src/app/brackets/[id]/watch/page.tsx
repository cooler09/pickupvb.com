import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { repositories } from '@/lib/handlers';
import { isPro } from '@/lib/pro';
import { LiveScoresProvider } from '@/app/events/[id]/_components/live-scores-provider';
import { BoardView, pickLatestMatchId } from '@/app/events/[id]/bracket/_components/board-view';
import { LatestMatchTracker } from '@/app/events/[id]/bracket/_components/latest-match-tracker';
import { BracketRealtimeRefresher } from '@/app/events/[id]/bracket/_components/realtime-refresher';
import {
  FORMAT_LABEL,
  type BracketScope,
  type TeamLite,
} from '@/app/events/[id]/bracket/_components/labels';

/**
 * Public spectator view of a standalone bracket (ADR 0025). Read-only, no
 * owner affordances. Anyone with the link can watch it update live via the
 * realtime refresher. RLS on the bracket tables is `for select using (true)`,
 * so anon viewers see the same data.
 *
 * Per the "no force-dynamic on public pages" rule this opts into ISR + relies
 * on the realtime refresher for liveness, like the event watch page.
 */
export const revalidate = 15;

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const bracket = await repositories.bracketRepo.findById(id as never);
  if (!bracket || !bracket.ownerUserId) return { title: 'Live bracket — PickupVB' };
  const title = `Live bracket — ${FORMAT_LABEL[bracket.format]} · PickupVB`;
  return {
    title,
    description: 'Follow this bracket live on PickupVB. Match results update in real time.',
    alternates: { canonical: `/brackets/${id}/watch` },
    openGraph: { title, type: 'website', siteName: 'PickupVB' },
  };
}

function pickQuery(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function StandaloneBracketWatchPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const bracket = await repositories.bracketRepo.findById(id as never);
  if (!bracket || !bracket.ownerUserId) notFound();

  const registeredTeams = (await repositories.bracketRepo.listStandaloneTeams(
    id as never,
  )) as TeamLite[];
  const teamById = new Map<string, TeamLite>();
  for (const t of registeredTeams) teamById.set(t.entryId, t);

  const scope: BracketScope = { kind: 'standalone', bracketId: id };
  // Spectators see in-progress scoreboard scores live, but only when the
  // bracket owner is Pro (mirrors the scorer's gate). ADR 0023/0025.
  const liveScoringEnabled = await isPro(bracket.ownerUserId);
  const focusParam = pickQuery(searchParams, 'focus') ?? null;

  return (
    <article className="mx-auto max-w-5xl space-y-6 p-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-fg text-2xl font-bold">Live bracket</h1>
          {bracket.status === 'active' && (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
              ● LIVE
            </span>
          )}
          {bracket.status === 'completed' && (
            <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
              Final
            </span>
          )}
        </div>
        <p className="text-fg/80 text-sm">{FORMAT_LABEL[bracket.format]}</p>
        <p className="text-muted text-sm">
          {registeredTeams.length} team{registeredTeams.length === 1 ? '' : 's'} • Updates
          automatically
        </p>
      </header>

      <BracketRealtimeRefresher bracketId={bracket.id} />

      {(bracket.status === 'setup' || bracket.status === 'draft') && (
        <div className="border-border-base bg-bg rounded-shape-sm border p-6 text-center">
          <p className="text-fg/80 text-sm">
            {bracket.status === 'draft'
              ? 'The organizer is finalizing the bracket. It will appear here once they publish it.'
              : `Seeding is in progress. The bracket will appear here once it${'’'}s generated.`}
          </p>
        </div>
      )}

      {(bracket.status === 'active' || bracket.status === 'completed') && (
        <LiveScoresProvider enabled={liveScoringEnabled} bracketId={bracket.id}>
          <LatestMatchTracker
            matchId={pickLatestMatchId(bracket.matches)}
            autoScroll
            initialFocusId={focusParam}
          />
          <BoardView
            scope={scope}
            matches={[...bracket.matches]}
            teamById={teamById}
            bestOf={bracket.config.bestOf}
            targetScore={bracket.config.targetScore}
            targetScores={bracket.config.targetScores}
            playoffBestOf={bracket.config.playoffBestOf}
            playoffTargetScore={bracket.config.playoffTargetScore}
            playoffTargetScores={bracket.config.playoffTargetScores}
            isHost={false}
            viewerId={null}
            status={bracket.status}
            format={bracket.format}
            highlightMatchId={focusParam ?? pickLatestMatchId(bracket.matches)}
            liveScoringEnabled={liveScoringEnabled}
          />
        </LiveScoresProvider>
      )}
    </article>
  );
}
