'use client';

import { useState, type ReactNode } from 'react';

type Props = {
  /** Count badge for the "Register team" tab — e.g. registered teams. */
  teamCount: number;
  /** Count badge for the "Free agent" tab — e.g. available free agents. */
  freeAgentCount: number;
  /** When true, the "Free agent" tab gets the initial focus state. */
  defaultTab?: 'team' | 'free-agent';
  teamPanel: ReactNode;
  freeAgentPanel: ReactNode;
};

/**
 * Tabbed wrapper that groups the team-signup and free-agent panels into a
 * single card. Reduces vertical bloat on tournament pages and gives a
 * clearer "pick one" affordance.
 *
 * The two underlying panels stay server components — they're passed in as
 * children so this client wrapper never imports their server actions.
 */
export function TournamentRegistrationTabs({
  teamCount,
  freeAgentCount,
  defaultTab = 'team',
  teamPanel,
  freeAgentPanel,
}: Props) {
  const [tab, setTab] = useState<'team' | 'free-agent'>(defaultTab);

  return (
    <section className="border-border-base overflow-hidden rounded-lg border" id="signup">
      <div
        role="tablist"
        aria-label="Tournament registration"
        className="border-border-base bg-fg/[0.02] flex border-b"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'team'}
          aria-controls="reg-tab-team"
          id="reg-trigger-team"
          onClick={() => setTab('team')}
          className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
            tab === 'team'
              ? 'text-fg border-primary border-b-2'
              : 'text-muted hover:text-fg border-b-2 border-transparent'
          }`}
        >
          Register team <span className="text-muted text-xs font-normal">({teamCount})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'free-agent'}
          aria-controls="reg-tab-free-agent"
          id="reg-trigger-free-agent"
          onClick={() => setTab('free-agent')}
          className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
            tab === 'free-agent'
              ? 'text-fg border-primary border-b-2'
              : 'text-muted hover:text-fg border-b-2 border-transparent'
          }`}
        >
          Free agent <span className="text-muted text-xs font-normal">({freeAgentCount})</span>
        </button>
      </div>
      <div
        role="tabpanel"
        id="reg-tab-team"
        aria-labelledby="reg-trigger-team"
        hidden={tab !== 'team'}
      >
        {teamPanel}
      </div>
      <div
        role="tabpanel"
        id="reg-tab-free-agent"
        aria-labelledby="reg-trigger-free-agent"
        hidden={tab !== 'free-agent'}
      >
        {freeAgentPanel}
      </div>
    </section>
  );
}
