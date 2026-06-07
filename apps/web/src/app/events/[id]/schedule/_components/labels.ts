export const NOTICE_LABEL: Record<string, { text: string; tone: 'success' | 'error' }> = {
  added: { text: 'Match added.', tone: 'success' },
  generated: { text: 'Season schedule generated.', tone: 'success' },
  cleared: { text: 'Schedule cleared.', tone: 'success' },
  updated: { text: 'Match updated.', tone: 'success' },
  removed: { text: 'Match removed.', tone: 'success' },
  recorded: { text: 'Result recorded.', tone: 'success' },
  forbidden: { text: 'You do not have permission to do that.', tone: 'error' },
  conflict: { text: 'That change conflicts with the current schedule.', tone: 'error' },
  notfound: { text: 'Match not found.', tone: 'error' },
  invalid: { text: 'Invalid input.', tone: 'error' },
  error: { text: 'Something went wrong.', tone: 'error' },
};
