'use client';

import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import type { MatchKind } from '@pickupvb/domain';
import { generateRoomCode } from '@/app/tools/scoreboard/_lib/room-code';

/**
 * "Score live" entry point — ADR 0023 Phase 4. Launches the live scoreboard
 * pre-seeded for a scheduled match and bound to it, so the host can score on
 * the scoreboard and save the result back to the official record.
 *
 * Pro-gated by the *caller*: render this only when `isPro(event.hostUserId)`
 * (the host-level gate) and the viewer is the host or a team captain. The
 * finalize action re-checks the Pro gate server-side.
 *
 * Generates the room code in the click handler (not render) so the impure
 * `crypto.getRandomValues` read stays out of the React render body
 * (AGENTS.md pitfall #4), and so each launch is a fresh room.
 */
export function ScoreLiveButton(props: {
  eventId: string;
  divisionId: string;
  matchId: string;
  kind: MatchKind;
  teamA: string;
  teamB: string;
  /** Scoreboard format. League has no stored best-of — pass 1 (single game). */
  bestOf: number;
  targetScore?: number;
  winBy?: number;
  returnPath: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();

  function onClick() {
    const code = generateRoomCode();
    const params = new URLSearchParams({
      ta: props.teamA || 'Home',
      tb: props.teamB || 'Away',
      t: String(props.targetScore ?? 25),
      wb: String(props.winBy ?? 2),
      bo: String(Math.max(1, props.bestOf)),
      event: props.eventId,
      division: props.divisionId,
      match: props.matchId,
      kind: props.kind,
      ret: props.returnPath,
    });
    router.push(`/tools/scoreboard/${code}?${params.toString()}` as Route);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        props.className ??
        'border-primary/40 text-primary hover:bg-primary/5 rounded border px-2 py-0.5 text-xs font-medium'
      }
    >
      {props.label ?? 'Score live'}
    </button>
  );
}
