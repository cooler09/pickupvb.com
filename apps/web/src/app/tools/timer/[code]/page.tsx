import { notFound } from 'next/navigation';
import { isValidRoomCode, normalizeRoomCode } from '../../_lib/room-code.js';
import { DEFAULT_TIMER_CONFIG, type TimerConfig } from '../_lib/timer.js';
import { TimerView } from '../_components/timer-view.js';

export const metadata = {
  title: 'Match timer',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The setup form encodes the chosen duration as `m` (minutes) + `s` (seconds)
 * and an optional `l` (label). These are only a fallback: the first realtime
 * broadcast from any peer overrides them, so a device opening the bare room
 * link still catches up to the live clock.
 */
function parseConfig(params: SearchParams): TimerConfig {
  const num = (raw: string | undefined, min: number, max: number): number => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.min(max, Math.max(min, Math.floor(n)));
  };
  const minutes = num(single(params['m']), 0, 999);
  const seconds = num(single(params['s']), 0, 59);
  const durationMs = (minutes * 60 + seconds) * 1000;
  const label = (single(params['l']) ?? '').slice(0, 40);
  return {
    label,
    durationMs: durationMs > 0 ? durationMs : DEFAULT_TIMER_CONFIG.durationMs,
  };
}

export default async function TimerRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ code: rawCode }, sp] = await Promise.all([params, searchParams]);
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) notFound();
  return <TimerView code={code} initialConfig={parseConfig(sp)} />;
}
