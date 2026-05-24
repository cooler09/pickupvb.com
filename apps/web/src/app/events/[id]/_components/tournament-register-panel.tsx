'use client';

import { useState, type ReactNode } from 'react';

type Mode = 'team' | 'free-agent';

type Props = {
  /** Count badge for the team option — registered teams on this event. */
  teamCount: number;
  /** Count badge for the free-agent option — agents looking for a team. */
  freeAgentCount: number;
  /**
   * Smart default. Pick `'free-agent'` when the viewer is already signed
   * up as one; pick `'team'` when they're a captain on a registered team
   * (roster mode) or have a pending ad-hoc registration. Otherwise the
   * caller should default to `'team'` (registering is the more common
   * intent on a tournament page).
   */
  defaultMode?: Mode;
  /**
   * When `false`, the team option is hidden entirely and the panel
   * renders only the free-agent flow (no picker). Set this when the
   * event's `team_registration_mode` is `null` — i.e. the host opted
   * out of team registration.
   */
  teamEnabled: boolean;
  teamPanel: ReactNode;
  freeAgentPanel: ReactNode;
};

/**
 * Replaces the older tabbed wrapper. Tabs implied the two choices were
 * coordinate ("which view do you want?"); the audit
 * (`docs/audits/registration-workflow.md` UX P2) called this out as
 * misleading because most users have already decided whether they're
 * registering a team or signing up solo before they land on the page.
 *
 * This wrapper asks the question directly with a single segmented
 * picker ("How are you signing up?") above one panel at a time.
 * Defers the full division → mode → roster → pay wizard the audit
 * sketches — see [ADR 0008 §6](../../../../../../docs/adr/0008-team-registration-paradigm.md)
 * for why that collapse is left as a follow-up UX bundle.
 *
 * The two underlying panels stay server components — they're passed in
 * as `ReactNode` children so this client wrapper never imports their
 * server actions.
 */
export function TournamentRegisterPanel({
  teamCount,
  freeAgentCount,
  defaultMode = 'team',
  teamEnabled,
  teamPanel,
  freeAgentPanel,
}: Props) {
  const initialMode: Mode = teamEnabled ? defaultMode : 'free-agent';
  const [mode, setMode] = useState<Mode>(initialMode);

  // No choice to surface — render the free-agent panel directly.
  if (!teamEnabled) {
    return (
      <section className="border-border-base overflow-hidden rounded-lg border" id="signup">
        {freeAgentPanel}
      </section>
    );
  }

  return (
    <section className="border-border-base overflow-hidden rounded-lg border" id="signup">
      <div className="border-border-base bg-fg/[0.02] border-b px-4 py-3">
        <div
          role="radiogroup"
          aria-label="How are you signing up?"
          className="border-border-base flex overflow-hidden rounded-md border"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'team'}
            onClick={() => setMode('team')}
            className={`flex-1 px-4 py-2 text-sm font-semibold transition-colors ${
              mode === 'team'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted hover:text-fg hover:bg-fg/[0.04]'
            }`}
          >
            Register a team{' '}
            <span
              className={`text-xs font-normal ${mode === 'team' ? 'opacity-80' : 'text-muted'}`}
            >
              ({teamCount})
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'free-agent'}
            onClick={() => setMode('free-agent')}
            className={`border-border-base flex-1 border-l px-4 py-2 text-sm font-semibold transition-colors ${
              mode === 'free-agent'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted hover:text-fg hover:bg-fg/[0.04]'
            }`}
          >
            Sign up solo{' '}
            <span
              className={`text-xs font-normal ${mode === 'free-agent' ? 'opacity-80' : 'text-muted'}`}
            >
              ({freeAgentCount})
            </span>
          </button>
        </div>
      </div>
      <div hidden={mode !== 'team'}>{teamPanel}</div>
      <div hidden={mode !== 'free-agent'}>{freeAgentPanel}</div>
    </section>
  );
}
