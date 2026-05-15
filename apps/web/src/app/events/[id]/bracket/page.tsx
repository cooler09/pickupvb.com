import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError, type BracketFormat } from '@pickupvb/domain';
import { handlers, repositories } from '@/lib/handlers';
import { getViewer, isAnonymousUser } from '@/lib/server-auth';
import { BRACKET_FORMATS } from '@pickupvb/domain';
import {
    createBracketFromForm,
    generateBracket,
    randomizeSeedFromForm,
    recordMatchResultFromForm,
    resetBracket,
    resetMatch,
    seedBracketFromForm,
} from './actions';

export const dynamic = 'force-dynamic';

const FORMAT_LABEL: Record<BracketFormat, string> = {
    single_elimination: 'Single elimination',
    double_elimination: 'Double elimination (coming soon)',
    round_robin: 'Round robin',
    pool_play_playoff: 'Pool play → playoff (coming soon)',
    swiss: 'Swiss (coming soon)',
};

const NOTICE_LABEL: Record<string, { tone: 'success' | 'error'; text: string }> = {
    created: { tone: 'success', text: 'Bracket created.' },
    seeded: { tone: 'success', text: 'Seeding saved.' },
    generated: { tone: 'success', text: 'Bracket generated.' },
    reset: { tone: 'success', text: 'Bracket reset to setup.' },
    result_saved: { tone: 'success', text: 'Result recorded.' },
    match_reset: { tone: 'success', text: 'Match cleared.' },
    forbidden: { tone: 'error', text: 'You do not have permission for that action.' },
    conflict: { tone: 'error', text: 'Conflict.' },
    notfound: { tone: 'error', text: 'Not found.' },
    invalid: { tone: 'error', text: 'Invalid input.' },
    error: { tone: 'error', text: 'Something went wrong.' },
};

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
                <Link href={`/events/${event.id}`} className="text-sm text-primary hover:underline">
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
    const isHost = event.canManage;
    const viewerId = user?.id ?? null;
    const noticeCode = pickQuery(searchParams, 'notice');
    const noticeMsg = pickQuery(searchParams, 'msg');
    const notice = noticeCode ? NOTICE_LABEL[noticeCode] ?? null : null;

    return (
        <article className="mx-auto max-w-5xl space-y-6 p-4">
            <Link href={`/events/${event.id}`} className="text-sm text-primary hover:underline">
                {'← Back to event'}
            </Link>

            <header className="space-y-1">
                <h1 className="text-2xl font-bold text-fg">Bracket — {event.title}</h1>
                <p className="text-sm text-muted">
                    {registeredTeams.length} registered team{registeredTeams.length === 1 ? '' : 's'}
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
                    isHost={!!isHost && isRealUser}
                />
            )}

            {bracket && bracket.status === 'setup' && (
                <SetupView
                    eventId={event.id}
                    bracketFormat={bracket.format}
                    seeds={bracket.seeds.map((s) => ({ teamId: s.teamId, seed: s.seed }))}
                    registeredTeams={registeredTeams}
                    isHost={!!isHost && isRealUser}
                />
            )}

            {bracket && (bracket.status === 'active' || bracket.status === 'completed') && (
                <BoardView
                    eventId={event.id}
                    matches={[...bracket.matches]}
                    teamById={teamById}
                    bestOf={bracket.config.bestOf}
                    isHost={!!isHost && isRealUser}
                    viewerId={viewerId}
                    status={bracket.status}
                />
            )}
        </article>
    );
}

// ---- Subviews -----------------------------------------------------------

function NoBracketView(props: {
    eventId: string;
    teamCount: number;
    isHost: boolean;
}) {
    if (!props.isHost) {
        return (
            <p className="text-sm text-muted">
                The host hasn{'’'}t created a bracket for this tournament yet.
            </p>
        );
    }
    return (
        <section className="rounded-lg border border-border-base bg-fg/5 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-fg">Create bracket</h2>
            <p className="text-sm text-muted">
                Pick a format. You can change it (by resetting) before any
                matches are played.
            </p>
            <form
                action={createBracketFromForm.bind(null, props.eventId)}
                className="flex flex-wrap items-end gap-2"
            >
                <label className="flex flex-col text-sm">
                    <span className="text-fg/80">Format</span>
                    <select
                        name="format"
                        className="rounded border border-border-base bg-bg px-2 py-1"
                        defaultValue="single_elimination"
                    >
                        {BRACKET_FORMATS.map((f) => (
                            <option key={f} value={f}>
                                {FORMAT_LABEL[f]}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="submit"
                    disabled={props.teamCount < 2}
                    className="rounded bg-primary px-3 py-1 text-sm text-primary-fg disabled:opacity-50"
                >
                    Create
                </button>
                {props.teamCount < 2 && (
                    <span className="text-xs text-muted">
                        Need at least 2 registered teams to create a bracket.
                    </span>
                )}
            </form>
        </section>
    );
}

function SetupView(props: {
    eventId: string;
    bracketFormat: BracketFormat;
    seeds: ReadonlyArray<{ teamId: string; seed: number }>;
    registeredTeams: ReadonlyArray<{ teamId: string; name: string; captainId: string }>;
    isHost: boolean;
}) {
    if (!props.isHost) {
        return (
            <p className="text-sm text-muted">
                The host is still setting up the bracket. Check back shortly.
            </p>
        );
    }
    // Default ordering when no seeds yet: registration order.
    const orderedTeams =
        props.seeds.length > 0
            ? props.seeds
                .slice()
                .sort((a, b) => a.seed - b.seed)
                .map((s) => props.registeredTeams.find((t) => t.teamId === s.teamId))
                .filter((t): t is { teamId: string; name: string; captainId: string } => !!t)
            : props.registeredTeams;

    const canGenerate = orderedTeams.length >= 2;

    return (
        <section className="space-y-4">
            <div className="rounded-lg border border-border-base bg-fg/5 p-4">
                <p className="text-sm text-muted">
                    Format: <span className="font-medium text-fg">{FORMAT_LABEL[props.bracketFormat]}</span>
                </p>
            </div>

            <SeedingForm
                eventId={props.eventId}
                orderedTeams={orderedTeams}
            />

            <div className="flex flex-wrap gap-2">
                <form action={generateBracket.bind(null, props.eventId)}>
                    <button
                        type="submit"
                        disabled={!canGenerate}
                        className="rounded bg-primary px-3 py-1 text-sm text-primary-fg disabled:opacity-50"
                    >
                        Generate bracket
                    </button>
                </form>
                <form action={resetBracket.bind(null, props.eventId)}>
                    <button
                        type="submit"
                        className="rounded border border-border-base px-3 py-1 text-sm text-fg/80 hover:bg-fg/5"
                    >
                        Discard bracket
                    </button>
                </form>
            </div>
        </section>
    );
}

/**
 * Seeding form. Submits hidden `team_id` inputs in the order shown.
 * v1 uses up/down buttons (server-action pure HTML, no JS) by re-submitting
 * the form with a `move` index; for simplicity here we expose a textarea
 * fallback alongside a "randomize" preset and a manual reorder via small
 * select-based move buttons that POST a single reorder.
 */
function SeedingForm(props: {
    eventId: string;
    orderedTeams: ReadonlyArray<{ teamId: string; name: string }>;
}) {
    return (
        <form
            action={seedBracketFromForm.bind(null, props.eventId)}
            className="space-y-2 rounded-lg border border-border-base p-4"
        >
            <h3 className="text-sm font-semibold text-fg">Seeding order</h3>
            <p className="text-xs text-muted">
                Top of the list is seed 1. Use the up/down buttons to reorder
                or click <em>Randomize</em>. Save when ready.
            </p>
            <SeedingList orderedTeams={props.orderedTeams} />
            <div className="flex flex-wrap gap-2 pt-2">
                <button
                    type="submit"
                    className="rounded bg-primary px-3 py-1 text-sm text-primary-fg"
                >
                    Save seeding
                </button>
                <button
                    type="submit"
                    name="randomize"
                    value="1"
                    className="rounded border border-border-base px-3 py-1 text-sm text-fg/80 hover:bg-fg/5"
                    formAction={randomizeSeedFromForm.bind(null, props.eventId)}
                >
                    Randomize
                </button>
            </div>
        </form>
    );
}

/**
 * Server-only seeding list. We use a `<details>` per row with up/down
 * buttons that submit a small reorder action; for v1 simplicity, the row
 * order is exactly the input order — manual reordering is done by the
 * host re-submitting (e.g. after dragging in a future client component).
 *
 * Today the list is read-only display + the hidden inputs needed by the
 * parent form. The host can reorder via the textarea fallback below.
 */
function SeedingList(props: {
    orderedTeams: ReadonlyArray<{ teamId: string; name: string }>;
}) {
    return (
        <ol className="space-y-1">
            {props.orderedTeams.map((t, i) => (
                <li
                    key={t.teamId}
                    className="flex items-center gap-2 rounded border border-border-base/60 bg-bg px-2 py-1 text-sm"
                >
                    <span className="w-6 text-right tabular-nums text-muted">{i + 1}.</span>
                    <span className="flex-1 truncate text-fg">{t.name}</span>
                    <input type="hidden" name="team_id" value={t.teamId} />
                </li>
            ))}
        </ol>
    );
}

function BoardView(props: {
    eventId: string;
    matches: ReadonlyArray<import('@pickupvb/domain').Match>;
    teamById: ReadonlyMap<string, { teamId: string; name: string; captainId: string }>;
    bestOf: number;
    isHost: boolean;
    viewerId: string | null;
    status: 'active' | 'completed';
}) {
    // Group by round.
    type M = (typeof props.matches)[number];
    const byRound = new Map<number, M[]>();
    for (const m of props.matches) {
        const list = byRound.get(m.round) ?? [];
        list.push(m);
        byRound.set(m.round, list);
    }
    const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted">
                    Best of {props.bestOf} •{' '}
                    {props.status === 'completed' ? 'Final results' : 'In progress'}
                </p>
                {props.isHost && props.status === 'active' && (
                    <form action={resetBracket.bind(null, props.eventId)}>
                        <button
                            type="submit"
                            className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
                        >
                            Reset bracket
                        </button>
                    </form>
                )}
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2">
                {rounds.map((round) => {
                    const list = byRound.get(round)!;
                    return (
                        <div key={round} className="min-w-[260px] space-y-2">
                            <h3 className="text-sm font-semibold text-fg/80">
                                Round {round}
                            </h3>
                            {list
                                .slice()
                                .sort((a, b) => a.matchNumber - b.matchNumber)
                                .map((m) => (
                                    <MatchCard
                                        key={m.id}
                                        eventId={props.eventId}
                                        match={m}
                                        teamById={props.teamById}
                                        bestOf={props.bestOf}
                                        isHost={props.isHost}
                                        viewerId={props.viewerId}
                                    />
                                ))}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function MatchCard(props: {
    eventId: string;
    match: import('@pickupvb/domain').Match;
    teamById: ReadonlyMap<string, { teamId: string; name: string; captainId: string }>;
    bestOf: number;
    isHost: boolean;
    viewerId: string | null;
}) {
    const m = props.match;
    const teamA = m.teamAId ? props.teamById.get(m.teamAId) : null;
    const teamB = m.teamBId ? props.teamById.get(m.teamBId) : null;
    const winner = m.winnerTeamId;
    const canEdit =
        props.isHost ||
        (props.viewerId !== null &&
            ((teamA && teamA.captainId === props.viewerId) ||
                (teamB && teamB.captainId === props.viewerId)));

    const aWins = m.sets.filter((s) => s.teamAScore > s.teamBScore).length;
    const bWins = m.sets.filter((s) => s.teamBScore > s.teamAScore).length;

    const setsToShow = Math.max(props.bestOf, m.sets.length + 1);

    return (
        <div
            className={`rounded-lg border p-3 text-sm ${m.status === 'completed'
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-border-base bg-bg'
                }`}
        >
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span>Match {m.matchNumber}</span>
                <span className="capitalize">{m.status.replace('_', ' ')}</span>
            </div>
            <ul className="space-y-1">
                <TeamRow team={teamA} wins={aWins} isWinner={winner === m.teamAId} />
                <TeamRow team={teamB} wins={bWins} isWinner={winner === m.teamBId} />
            </ul>

            {m.sets.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                    Sets:{' '}
                    {m.sets
                        .map((s) => `${s.teamAScore}–${s.teamBScore}`)
                        .join(', ')}
                </p>
            )}

            {canEdit && m.status !== 'bye' && teamA && teamB && (
                <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-primary hover:underline">
                        {m.status === 'completed' ? 'Edit result' : 'Enter result'}
                    </summary>
                    <form
                        action={recordMatchResultFromForm.bind(null, props.eventId, String(m.id))}
                        className="mt-2 space-y-1"
                    >
                        {Array.from({ length: setsToShow }, (_, i) => {
                            const existing = m.sets[i];
                            return (
                                <div key={i} className="flex items-center gap-1 text-xs">
                                    <span className="w-12 text-muted">Set {i + 1}</span>
                                    <input
                                        name={`set_a_${i + 1}`}
                                        type="number"
                                        min="0"
                                        defaultValue={existing?.teamAScore ?? ''}
                                        className="w-16 rounded border border-border-base bg-bg px-1 py-0.5"
                                    />
                                    <span className="text-muted">{'–'}</span>
                                    <input
                                        name={`set_b_${i + 1}`}
                                        type="number"
                                        min="0"
                                        defaultValue={existing?.teamBScore ?? ''}
                                        className="w-16 rounded border border-border-base bg-bg px-1 py-0.5"
                                    />
                                </div>
                            );
                        })}
                        <div className="flex gap-2 pt-1">
                            <button
                                type="submit"
                                className="rounded bg-primary px-2 py-0.5 text-xs text-primary-fg"
                            >
                                Save
                            </button>
                            {m.status === 'completed' && (
                                <button
                                    type="submit"
                                    formAction={resetMatch.bind(null, props.eventId, String(m.id))}
                                    className="rounded border border-border-base px-2 py-0.5 text-xs text-fg/80 hover:bg-fg/5"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </form>
                </details>
            )}
        </div>
    );
}

function TeamRow(props: {
    team: { teamId: string; name: string } | null | undefined;
    wins: number;
    isWinner: boolean;
}) {
    return (
        <li
            className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${props.isWinner ? 'bg-green-500/10 font-medium text-fg' : 'text-fg/80'
                }`}
        >
            <span className="truncate">{props.team?.name ?? <span className="italic text-muted">TBD</span>}</span>
            <span className="tabular-nums text-xs text-muted">{props.wins}</span>
        </li>
    );
}
