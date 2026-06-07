import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ShareLink } from '@/components/share-link';
import { SubmitButton } from '@/components/submit-button';
import { errorButtonClass } from '@/components/primary-button';
import { repositories } from '@/lib/handlers';
import { deleteStandaloneBracket } from '../actions';
import { isPro } from '@/lib/pro';
import { BracketId } from '@pickupvb/domain';
import { getViewer, isAnonymousUser } from '@/lib/server-auth';
import { LiveScoresProvider } from '@/app/events/[id]/_components/live-scores-provider';
import { BoardView, pickLatestMatchId } from '@/app/events/[id]/bracket/_components/board-view';
import { DraftWorkspace } from '@/app/events/[id]/bracket/_components/draft-workspace';
import { LatestMatchTracker } from '@/app/events/[id]/bracket/_components/latest-match-tracker';
import { SetupView } from '@/app/events/[id]/bracket/_components/setup-view';
import { BracketRealtimeRefresher } from '@/app/events/[id]/bracket/_components/realtime-refresher';
import {
  FORMAT_LABEL,
  NOTICE_LABEL,
  type BracketScope,
  type TeamLite,
} from '@/app/events/[id]/bracket/_components/labels';

function pickQuery(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Standalone bracket workspace (ADR 0025). Owner-only editing surface — reuses
 * the event bracket views via the `scope` prop. Non-owners are redirected to
 * the public watch view; the bracket always exists here (created on
 * `/brackets/new`), so there's no "no bracket" branch.
 */
export default async function StandaloneBracketPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const viewer = await getViewer();
  const user = viewer?.user ?? null;
  const isRealUser = !!user && !isAnonymousUser(user);

  const bracket = await repositories.bracketRepo.findById(BracketId(id));
  if (!bracket || !bracket.ownerUserId) notFound();

  // Only the owner edits here; everyone else gets the read-only watch view.
  if (!isRealUser || user!.id !== bracket.ownerUserId) {
    redirect(`/brackets/${id}/watch`);
  }

  const registeredTeams = (await repositories.bracketRepo.listStandaloneTeams(
    BracketId(id),
  )) as TeamLite[];

  const teamById = new Map<string, TeamLite>();
  for (const t of registeredTeams) teamById.set(t.entryId, t);

  const scope: BracketScope = { kind: 'standalone', bracketId: id };
  // ADR 0023/0025: live scoreboard scoring is enabled when the bracket's owner
  // is Pro (mirrors the event host-Pro gate). The finalize action re-checks it.
  const liveScoringEnabled = await isPro(bracket.ownerUserId);
  const focusParam = pickQuery(searchParams, 'focus') ?? null;
  const noticeCode = pickQuery(searchParams, 'notice');
  const noticeMsg = pickQuery(searchParams, 'msg');
  const notice = noticeCode ? (NOTICE_LABEL[noticeCode] ?? null) : null;

  return (
    <article className="mx-auto max-w-5xl space-y-6 p-4">
      <Link href="/brackets" className="text-primary text-sm hover:underline">
        {'← My brackets'}
      </Link>

      <header className="space-y-1">
        <h1 className="text-fg text-headline-sm font-bold">Bracket</h1>
        <p className="text-fg/80 text-sm">{FORMAT_LABEL[bracket.format]}</p>
        <p className="text-muted text-sm">
          {registeredTeams.length} team{registeredTeams.length === 1 ? '' : 's'}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link href={`/brackets/${id}/watch`} className="text-primary text-xs hover:underline">
            {'Open public spectator view →'}
          </Link>
          <ShareLink
            path={`/brackets/${id}/watch`}
            title="Live bracket"
            label="Share spectator link"
          />
        </div>
      </header>

      {notice && (
        <div
          role={notice.tone === 'success' ? 'status' : 'alert'}
          className={`rounded border px-3 py-2 text-sm ${
            notice.tone === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300'
              : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
          }`}
        >
          {notice.text}
          {noticeMsg && <span className="ml-1 opacity-80">— {noticeMsg}</span>}
        </div>
      )}

      <BracketRealtimeRefresher bracketId={bracket.id} />

      {bracket.status === 'setup' && (
        <SetupView
          scope={scope}
          bracketFormat={bracket.format}
          seeds={bracket.seeds.map((s) => ({ entryId: s.entryId, seed: s.seed }))}
          registeredTeams={registeredTeams}
          isHost
        />
      )}

      {bracket.status === 'draft' && (
        <DraftWorkspace
          scope={scope}
          format={bracket.format}
          bestOf={bracket.config.bestOf}
          targetScore={bracket.config.targetScore}
          matches={[...bracket.matches]}
          teams={registeredTeams}
          seeds={bracket.seeds.map((s) => ({ entryId: s.entryId, seed: s.seed, pool: s.pool }))}
        />
      )}

      {(bracket.status === 'active' || bracket.status === 'completed') && (
        <LiveScoresProvider enabled={liveScoringEnabled} bracketId={bracket.id}>
          <LatestMatchTracker
            matchId={pickLatestMatchId(bracket.matches)}
            autoScroll={false}
            initialFocusId={focusParam}
          />
          <BoardView
            scope={scope}
            matches={[...bracket.matches]}
            teamById={teamById}
            teams={registeredTeams}
            bestOf={bracket.config.bestOf}
            targetScore={bracket.config.targetScore}
            targetScores={bracket.config.targetScores}
            playoffBestOf={bracket.config.playoffBestOf}
            playoffTargetScore={bracket.config.playoffTargetScore}
            playoffTargetScores={bracket.config.playoffTargetScores}
            advancePerPool={bracket.config.advancePerPool}
            isHost
            viewerId={user!.id}
            status={bracket.status}
            format={bracket.format}
            highlightMatchId={focusParam ?? pickLatestMatchId(bracket.matches)}
            liveScoringEnabled={liveScoringEnabled}
          />
        </LiveScoresProvider>
      )}

      {/* Danger zone: delete the bracket entirely. Frees the free-tier
          active-bracket slot and is the only escape for a stuck bracket
          (TT-12). Two-step disclosure so it isn't a one-click mistake. */}
      <details className="border-border-base rounded-shape-sm border">
        <summary className="text-muted hover:text-fg cursor-pointer px-3 py-2 text-sm">
          Delete this bracket
        </summary>
        <div className="border-border-base space-y-2 border-t px-3 py-3">
          <p className="text-muted text-xs">
            Permanently removes this bracket and all of its teams, matches, and results. This can
            {'’'}t be undone.
          </p>
          <form action={deleteStandaloneBracket.bind(null, id)}>
            <SubmitButton className={errorButtonClass('sm')}>Delete bracket</SubmitButton>
          </form>
        </div>
      </details>
    </article>
  );
}
