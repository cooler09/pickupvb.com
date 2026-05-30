import { describe, it, expect } from 'vitest';
import { Division, DivisionId, type CreateDivisionProps } from './division.js';
import { Capacity } from './capacity.js';
import {
  AgeGroup,
  Format,
  Gender,
  PriceUnit,
  SkillTier,
  Surface,
  TeamComposition,
  TeamRegistrationMode,
} from './enums.js';
import { InvariantViolation } from '../shared/result.js';

/** Minimal valid create props; override per case. */
function props(overrides: Partial<CreateDivisionProps> = {}): CreateDivisionProps {
  return {
    id: DivisionId('div-1'),
    sortOrder: 0,
    label: 'Open AA',
    surface: Surface.Sand,
    format: Format.Doubles,
    gender: Gender.Coed,
    skillTier: SkillTier.AA,
    ...overrides,
  };
}

describe('Division.create', () => {
  describe('label', () => {
    it('trims the label', () => {
      expect(Division.create(props({ label: '  Open AA  ' })).label).toBe('Open AA');
    });

    it('rejects an empty label', () => {
      expect(() => Division.create(props({ label: '   ' }))).toThrow(InvariantViolation);
    });

    it('rejects a label over 60 characters', () => {
      expect(() => Division.create(props({ label: 'a'.repeat(61) }))).toThrow(InvariantViolation);
    });

    it('accepts a label at the 60-character boundary', () => {
      expect(Division.create(props({ label: 'a'.repeat(60) })).label).toHaveLength(60);
    });
  });

  describe('sortOrder', () => {
    it('rejects a negative sort order', () => {
      expect(() => Division.create(props({ sortOrder: -1 }))).toThrow(InvariantViolation);
    });

    it('rejects a non-integer sort order', () => {
      expect(() => Division.create(props({ sortOrder: 1.5 }))).toThrow(InvariantViolation);
    });

    it('accepts zero', () => {
      expect(Division.create(props({ sortOrder: 0 })).sortOrder).toBe(0);
    });
  });

  describe('surface × format compatibility', () => {
    it('rejects an indoor division running a non-six/quad format', () => {
      expect(() =>
        Division.create(props({ surface: Surface.Indoor, format: Format.Triples })),
      ).toThrow(InvariantViolation);
    });

    it('accepts indoor sixes', () => {
      const d = Division.create(props({ surface: Surface.Indoor, format: Format.Sixes }));
      expect(d.surface).toBe(Surface.Indoor);
      expect(d.format).toBe(Format.Sixes);
    });
  });

  describe('defaults', () => {
    it('applies the documented defaults when optional props are omitted', () => {
      const d = Division.create(props());
      expect(d.ageGroup).toBe(AgeGroup.Adult);
      expect(d.teamComposition).toBe(TeamComposition.Solo);
      expect(d.priceUnit).toBe(PriceUnit.PerPlayer);
      expect(d.allowFreeAgents).toBe(true);
      expect(d.teamRegistrationMode).toBeNull();
      expect(d.tierLabel).toBeNull();
      expect(d.teamSize).toBeNull();
      expect(d.capacity).toBeNull();
      expect(d.priceCents).toBeNull();
      expect(d.prizeText).toBeNull();
      expect(d.prizePurseCents).toBeNull();
      expect(d.startsAt).toBeNull();
      expect(d.endsAt).toBeNull();
    });

    it('honours an explicit allowFreeAgents=false', () => {
      expect(Division.create(props({ allowFreeAgents: false })).allowFreeAgents).toBe(false);
    });
  });

  describe('tierLabel', () => {
    it('trims and keeps a non-empty override', () => {
      expect(Division.create(props({ tierLabel: '  BB/B  ' })).tierLabel).toBe('BB/B');
    });

    it('coerces a whitespace-only override to null', () => {
      expect(Division.create(props({ tierLabel: '   ' })).tierLabel).toBeNull();
    });

    it('rejects a tier label over 40 characters', () => {
      expect(() => Division.create(props({ tierLabel: 'a'.repeat(41) }))).toThrow(
        InvariantViolation,
      );
    });
  });

  describe('teamSize', () => {
    it('rejects a team size below 1', () => {
      expect(() => Division.create(props({ teamSize: 0 }))).toThrow(InvariantViolation);
    });

    it('rejects a team size above 24', () => {
      expect(() => Division.create(props({ teamSize: 25 }))).toThrow(InvariantViolation);
    });

    it('rejects a non-integer team size', () => {
      expect(() => Division.create(props({ teamSize: 2.5 }))).toThrow(InvariantViolation);
    });

    it('requires a team size when composition is Partners', () => {
      expect(() => Division.create(props({ teamComposition: TeamComposition.Partners }))).toThrow(
        InvariantViolation,
      );
    });

    it('requires a team size when composition is PairDraw', () => {
      expect(() => Division.create(props({ teamComposition: TeamComposition.PairDraw }))).toThrow(
        InvariantViolation,
      );
    });

    it('accepts Partners with a valid team size', () => {
      const d = Division.create(props({ teamComposition: TeamComposition.Partners, teamSize: 2 }));
      expect(d.teamComposition).toBe(TeamComposition.Partners);
      expect(d.teamSize).toBe(2);
    });
  });

  describe('priceCents', () => {
    it('rejects a negative price', () => {
      expect(() => Division.create(props({ priceCents: -1 }))).toThrow(InvariantViolation);
    });

    it('rejects a non-integer price', () => {
      expect(() => Division.create(props({ priceCents: 999.5 }))).toThrow(InvariantViolation);
    });

    it('rejects a price over the 1,000,000-cent cap', () => {
      expect(() => Division.create(props({ priceCents: 1_000_001 }))).toThrow(InvariantViolation);
    });

    it('accepts a zero (free) price', () => {
      expect(Division.create(props({ priceCents: 0 })).priceCents).toBe(0);
    });
  });

  describe('prize', () => {
    it('trims prize text and coerces whitespace to null', () => {
      expect(Division.create(props({ prizeText: '  Cash  ' })).prizeText).toBe('Cash');
      expect(Division.create(props({ prizeText: '   ' })).prizeText).toBeNull();
    });

    it('rejects prize text over 500 characters', () => {
      expect(() => Division.create(props({ prizeText: 'a'.repeat(501) }))).toThrow(
        InvariantViolation,
      );
    });

    it('rejects a negative prize purse', () => {
      expect(() => Division.create(props({ prizePurseCents: -5 }))).toThrow(InvariantViolation);
    });

    it('rejects a non-integer prize purse', () => {
      expect(() => Division.create(props({ prizePurseCents: 10.1 }))).toThrow(InvariantViolation);
    });
  });

  describe('schedule window', () => {
    it('rejects an end time on or before the start time', () => {
      const startsAt = new Date('2026-06-01T10:00:00Z');
      expect(() => Division.create(props({ startsAt, endsAt: startsAt }))).toThrow(
        InvariantViolation,
      );
      expect(() =>
        Division.create(props({ startsAt, endsAt: new Date('2026-06-01T09:00:00Z') })),
      ).toThrow(InvariantViolation);
    });

    it('accepts a valid window', () => {
      const startsAt = new Date('2026-06-01T10:00:00Z');
      const endsAt = new Date('2026-06-01T18:00:00Z');
      const d = Division.create(props({ startsAt, endsAt }));
      expect(d.startsAt).toEqual(startsAt);
      expect(d.endsAt).toEqual(endsAt);
    });

    it('accepts a one-sided window (start only)', () => {
      const startsAt = new Date('2026-06-01T10:00:00Z');
      const d = Division.create(props({ startsAt }));
      expect(d.startsAt).toEqual(startsAt);
      expect(d.endsAt).toBeNull();
    });
  });

  it('carries through a per-division capacity and registration mode', () => {
    const d = Division.create(
      props({
        capacity: Capacity.fixed(8),
        teamRegistrationMode: TeamRegistrationMode.AdHoc,
      }),
    );
    expect(d.capacity?.maxSpots).toBe(8);
    expect(d.teamRegistrationMode).toBe(TeamRegistrationMode.AdHoc);
  });
});

describe('Division.fromPersistence', () => {
  it('hydrates raw values without running create() invariants', () => {
    // Deliberately invalid for create() (empty label, negative sortOrder) to
    // prove fromPersistence is a no-validation rehydration path.
    const d = Division.fromPersistence({
      id: DivisionId('div-9'),
      sortOrder: -3,
      label: '',
      surface: Surface.Indoor,
      format: Format.Triples,
      gender: Gender.Mens,
      skillTier: SkillTier.Open,
      ageGroup: AgeGroup.U16,
      tierLabel: null,
      teamComposition: TeamComposition.Team,
      teamSize: null,
      capacity: null,
      priceCents: null,
      priceUnit: PriceUnit.PerTeam,
      prizeText: null,
      prizePurseCents: null,
      startsAt: null,
      endsAt: null,
      allowFreeAgents: false,
      teamRegistrationMode: TeamRegistrationMode.Roster,
    });
    expect(d.sortOrder).toBe(-3);
    expect(d.label).toBe('');
    expect(d.priceUnit).toBe(PriceUnit.PerTeam);
    expect(d.teamRegistrationMode).toBe(TeamRegistrationMode.Roster);
  });
});
