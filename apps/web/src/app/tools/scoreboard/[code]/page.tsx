import { notFound } from 'next/navigation';
import { DEFAULT_CONFIG, type ScoreboardConfig } from '../_lib/types.js';
import { isValidRoomCode, normalizeRoomCode } from '../_lib/room-code.js';
import type { MatchBinding, MatchKind } from '../_lib/binding.js';
import { ScoreboardView } from './_components/scoreboard-view.js';

export const metadata = {
  title: 'Scoreboard',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Per-set targets (the `ts` param, e.g. `ts=25,25,15`) — launched from a
 * bracket match whose sets are played to different totals. Each entry is
 * clamped to the same 1–99 range as the uniform target; bad/empty tokens are
 * dropped, and an entirely unusable list yields `undefined` (→ uniform target).
 */
function parseTargetScores(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const nums = raw
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.min(99, Math.max(1, Math.floor(n))));
  return nums.length > 0 ? nums : undefined;
}

function parseConfig(params: SearchParams): ScoreboardConfig {
  const num = (raw: string | undefined, fallback: number, min: number, max: number): number => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  };
  const targetScores = parseTargetScores(single(params['ts']));
  return {
    teamA: (single(params['ta']) || DEFAULT_CONFIG.teamA).slice(0, 30),
    teamB: (single(params['tb']) || DEFAULT_CONFIG.teamB).slice(0, 30),
    targetScore: num(single(params['t']), DEFAULT_CONFIG.targetScore, 1, 99),
    winBy: num(single(params['wb']), DEFAULT_CONFIG.winBy, 1, 10),
    bestOf: num(single(params['bo']), DEFAULT_CONFIG.bestOf, 1, 9),
    ...(targetScores ? { targetScores } : {}),
  };
}

/**
 * Optional match binding (ADR 0023 Phase 4). When the scoreboard was launched
 * from a scheduled match (`ScoreLiveButton`), the match params arrive as query
 * string and `ScoreboardView` shows a "Save final to match" affordance. Absent
 * → the plain free tool. A standalone bracket (ADR 0025) sends `bracket` +
 * `match` instead of `event` + `division`.
 */
function parseBinding(params: SearchParams): MatchBinding | undefined {
  const matchId = single(params['match']);
  const kindRaw = single(params['kind']);
  if (!matchId) return undefined;
  if (kindRaw !== 'bracket' && kindRaw !== 'league') return undefined;
  const kind: MatchKind = kindRaw;

  const bracketId = single(params['bracket']);
  if (bracketId) {
    const returnPath = single(params['ret']) || `/brackets/${bracketId}`;
    return { bracketId, matchId, kind, returnPath };
  }

  const eventId = single(params['event']);
  const divisionId = single(params['division']);
  if (!eventId || !divisionId) return undefined;
  const returnPath = single(params['ret']) || `/events/${eventId}`;
  return { eventId, divisionId, matchId, kind, returnPath };
}

export default async function ScoreboardRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ code: rawCode }, sp] = await Promise.all([params, searchParams]);
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) notFound();
  const config = parseConfig(sp);
  const binding = parseBinding(sp);
  return <ScoreboardView code={code} initialConfig={config} {...(binding ? { binding } : {})} />;
}
