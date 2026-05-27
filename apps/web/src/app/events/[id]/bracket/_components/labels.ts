import type { BracketFormat } from '@pickupvb/domain';

export type TeamLite = { teamId: string; name: string; captainId: string };

export const FORMAT_LABEL: Record<BracketFormat, string> = {
  single_elimination: 'Single elimination',
  double_elimination: 'Double elimination',
  round_robin: 'Round robin',
  pool_play_playoff: 'Pool play → playoff',
};

export const NOTICE_LABEL: Record<string, { tone: 'success' | 'error'; text: string }> = {
  created: { tone: 'success', text: 'Bracket created.' },
  seeded: { tone: 'success', text: 'Seeding saved.' },
  generated: { tone: 'success', text: 'Bracket generated.' },
  playoff_generated: { tone: 'success', text: 'Playoff bracket generated.' },
  reset: { tone: 'success', text: 'Bracket reset to setup.' },
  result_saved: { tone: 'success', text: 'Result recorded.' },
  match_reset: { tone: 'success', text: 'Match cleared.' },
  team_added: {
    tone: 'success',
    text: 'Team added to this division. Reorder and save seeding to include it.',
  },
  team_name_required: { tone: 'error', text: 'Team name is required.' },
  forbidden: { tone: 'error', text: 'You do not have permission for that action.' },
  conflict: { tone: 'error', text: 'Conflict.' },
  notfound: { tone: 'error', text: 'Not found.' },
  invalid: { tone: 'error', text: 'Invalid input.' },
  error: { tone: 'error', text: 'Something went wrong.' },
};
