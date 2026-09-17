import { describe, it, expect } from 'vitest';
import { Poll, PollClosed, PollCreated } from './poll.js';
import { InvariantViolation, ValidationError } from '../shared/result.js';

const baseQuestion = {
  id: 'q1',
  prompt: 'Are you coming?',
  kind: 'single' as const,
  required: true,
  options: [
    { id: 'o1', label: 'Yes' },
    { id: 'o2', label: 'No' },
  ],
};

function make(overrides: Partial<Parameters<typeof Poll.create>[0]> = {}) {
  return Poll.create({
    id: 'p1',
    creatorId: 'u1',
    title: 'Tuesday pickup',
    questions: [baseQuestion],
    ...overrides,
  });
}

describe('Poll.create', () => {
  it('builds an open poll and raises PollCreated', () => {
    const poll = make();
    expect(poll.status).toBe('open');
    expect(poll.title).toBe('Tuesday pickup');
    expect(poll.questions).toHaveLength(1);
    expect(poll.showRespondentNames).toBe(true);
    expect(poll.pendingEvents.some((e) => e instanceof PollCreated)).toBe(true);
  });

  it('rejects attaching to both an event and a group', () => {
    expect(() => make({ eventId: 'e1', groupId: 'g1' })).toThrow(InvariantViolation);
  });

  it('rejects an empty title', () => {
    expect(() => make({ title: '   ' })).toThrow(ValidationError);
  });

  it('rejects a poll with no questions', () => {
    expect(() => make({ questions: [] })).toThrow(ValidationError);
  });

  it('rejects a question with no options', () => {
    expect(() => make({ questions: [{ ...baseQuestion, options: [] }] })).toThrow(ValidationError);
  });

  it('rejects an unknown question kind', () => {
    expect(() =>
      // @ts-expect-error — exercising the runtime guard with a bad kind
      make({ questions: [{ ...baseQuestion, kind: 'ranked' }] }),
    ).toThrow(ValidationError);
  });
});

describe('Poll status', () => {
  it('close() flips to closed and raises PollClosed', () => {
    const poll = make();
    poll.pullEvents(); // drain the create event
    poll.close();
    expect(poll.status).toBe('closed');
    expect(poll.pendingEvents.some((e) => e instanceof PollClosed)).toBe(true);
  });

  it('reopen() flips back to open', () => {
    const poll = make();
    poll.close();
    poll.reopen();
    expect(poll.status).toBe('open');
  });
});

describe('Poll.replaceQuestions', () => {
  const newQuestions = [
    {
      id: 'q2',
      prompt: 'Which night?',
      kind: 'multi' as const,
      required: false,
      options: [
        { id: 'o3', label: 'Tue' },
        { id: 'o4', label: 'Thu' },
      ],
    },
  ];

  it('replaces the questions when there are no responses', () => {
    const poll = make();
    poll.replaceQuestions(newQuestions, false);
    expect(poll.questions).toHaveLength(1);
    expect(poll.questions[0]!.prompt).toBe('Which night?');
    expect(poll.questions[0]!.kind).toBe('multi');
  });

  it('refuses to restructure once responses exist', () => {
    const poll = make();
    expect(() => poll.replaceQuestions(newQuestions, true)).toThrow(InvariantViolation);
  });
});

describe('Poll.setMetadata', () => {
  it('updates the always-editable fields', () => {
    const poll = make();
    const closesAt = new Date('2026-08-01T00:00:00Z');
    poll.setMetadata({
      title: 'New title',
      description: 'Bring water',
      closesAt,
      showRespondentNames: false,
    });
    expect(poll.title).toBe('New title');
    expect(poll.description).toBe('Bring water');
    expect(poll.closesAt).toEqual(closesAt);
    expect(poll.showRespondentNames).toBe(false);
  });
});
