import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvariantViolation } from '@pickupvb/domain';

// Mock the SDK at the module boundary so no real client is constructed and no
// network call is made — we only assert how the unit maps the model's tool
// output into typed drafts and how it fails on a non-tool response.
const createMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = { create: createMock };
  }
  return { default: FakeAnthropic };
});

process.env.ANTHROPIC_API_KEY = 'test-key';

const { extractListingDrafts, coerceDraft } = await import('./listing-extract');

function toolResponse(listings: unknown[]) {
  return {
    content: [{ type: 'tool_use', id: 't1', name: 'emit_listings', input: { listings } }],
  };
}

beforeEach(() => {
  createMock.mockReset();
});

describe('extractListingDrafts', () => {
  it('maps the tool output to drafts and coerces invalid enums to null', async () => {
    createMock.mockResolvedValue(
      toolResponse([
        {
          title: 'Saturday beach doubles',
          externalUrl: 'https://facebook.com/events/1',
          surface: 'sand',
          format: 'doubles',
          skillLevel: 'wizard', // not a valid SkillLevel
          city: 'Erie',
        },
      ]),
    );

    const drafts = await extractListingDrafts('whatever');

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      title: 'Saturday beach doubles',
      externalUrl: 'https://facebook.com/events/1',
      surface: 'sand',
      format: 'doubles',
      skillLevel: null, // coerced
      city: 'Erie',
    });
  });

  it('drops rows without a usable (>=3 char) title', async () => {
    createMock.mockResolvedValue(toolResponse([{ title: 'ab' }, { title: 'Real event' }]));
    const drafts = await extractListingDrafts('whatever');
    expect(drafts.map((d) => d.title)).toEqual(['Real event']);
  });

  it('returns [] for blank input without calling the model', async () => {
    const drafts = await extractListingDrafts('   ');
    expect(drafts).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws InvariantViolation when the model returns no tool call', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'no tool here' }] });
    await expect(extractListingDrafts('whatever')).rejects.toBeInstanceOf(InvariantViolation);
  });

  it('throws InvariantViolation (not a bare Error) when the API call fails', async () => {
    createMock.mockRejectedValue(new Error('429 rate limited'));
    await expect(extractListingDrafts('whatever')).rejects.toBeInstanceOf(InvariantViolation);
  });
});

describe('coerceDraft', () => {
  it('trims strings, nulls blanks, and rejects invalid enum values', () => {
    expect(
      coerceDraft({ title: '  Hi there  ', surface: 'grass', format: 'nope', region: '' }),
    ).toEqual({
      title: 'Hi there',
      description: '',
      externalUrl: '',
      externalHostName: null,
      startsAtLocal: '',
      endsAtLocal: null,
      addressLine: null,
      city: null,
      region: null,
      postalCode: null,
      country: null,
      surface: 'grass',
      format: null,
      skillLevel: null,
    });
  });
});
