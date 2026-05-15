import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { handlers, repositories } from '@/lib/handlers';
import { getViewer, isAnonymousUser } from '@/lib/server-auth';
import { BoardView } from './_components/board-view';
import { NoBracketView } from './_components/no-bracket-view';
import { SetupView } from './_components/setup-view';
import { NOTICE_LABEL } from './_components/labels';

export const dynamic = 'force-dynamic';

function pickQuery(
    sp: Record<string, string | string[] | undefined> | undefined,
    key: string,
): string | undefined {
    const v = sp?.[key];
    return Array.isArray(v) ? v[0] : v;
}

export default async function BracketPage({
    params,
    searchParams,
}: {
    params: { id: string };
    searchParams?: Record<string, string | string[] | undefined>;
}) {
    const viewer = await getViewer();
    const user = viewer?.user ?? null;
    const isRealUser = !!user && !isAnonymousUser(user);

    let event;
    try {
        event = await handlers.getEventDetail.execute(
            new GetEventDetailQuery(params.id, user?.id ?? null),
        );
    } catch (err) {
        if (err instanceof NotFoundError) notFound();
        throw err;
    }
    if (event.type !== 'tournament') {
        return (
            <div className="mx-auto max-w-3xl space-y-4 p-4">
                <Link
                    href={`/events/${event.id}`}
                    className="text-sm text-primary hover:underline"
                >
                    {'← Back to event'}
                </Link>
                <p className="text-sm text-muted">
                    Brackets are only available for tournament events.
                </p>
            </div>
        );
    }

    const [bracket, registeredTeams] = await Promise.all([
        repositories.bracketRepo.findByEventId(event.id as never),
        repositories.bracketRepo.listRegisteredTeams(event.id as never),
    ]);

    const teamById = new Map(registeredTeams.map((t) => [t.teamId, t]));
    const isHost = !!event.canManage && isRealUser;
    const viewerId = user?.id ?? null;
    const noticeCode = pickQuery(searchParams, 'notice');
    const noticeMsg = pickQuery(searchParams, 'msg');
    const notice = noticeCode ? NOTICE_LABEL[noticeCode] ?? null : null;

    return (
        <article className="mx-auto max-w-5xl space-y-6 p-4">
            <Link
                href={`/events/${event.id}`}
                className="text-sm text-primary hover:underline"
            >
                {'← Back to event'}
            </Link>

            <header className="space-y-1">
                <h1 className="text-2xl font-bold text-fg">Bracket — {event.title}</h1>
                <p className="text-sm text-muted">
                    {registeredTeams.length} registered team
                    {registeredTeams.length === 1 ? '' : 's'}
                </p>
            </header>

            {notice && (
                <div
                    className={`rounded border px-3 py-2 text-sm ${notice.tone === 'success'
                        ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300'
                        : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                        }`}
                >
                    {notice.text}
                    {noticeMsg && <span className="ml-1 opacity-80">— {noticeMsg}</span>}
                </div>
            )}

            {!bracket && (
                <NoBracketView
                    eventId={event.id}
                    teamCount={registeredTeams.length}
                    isHost={isHost}
                />
            )}

            {bracket && bracket.status === 'setup' && (
                <SetupView
                    eventId={event.id}
                    bracketFormat={bracket.format}
                    seeds={bracket.seeds.map((s) => ({
                        teamId: s.teamId,
                        seed: s.seed,
                    }))}
                    registeredTeams={registeredTeams}
                    isHost={isHost}
                />
            )}

            {bracket && (bracket.status === 'active' || bracket.status === 'completed') && (
                <BoardView
                    eventId={event.id}
                    matches={[...bracket.matches]}
                    teamById={teamById}
                    bestOf={bracket.config.bestOf}
                    isHost={isHost}
                    viewerId={viewerId}
                    status={bracket.status}
                    format={bracket.format}
                />
            )}
        </article>
    );
}
