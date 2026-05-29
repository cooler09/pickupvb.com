import { idConstructor, type Brand } from '../shared/brand.js';
import { InvariantViolation } from '../shared/result.js';
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
import { assertFormatAllowedForSurface } from './rules.js';

export type DivisionId = Brand<string, 'DivisionId'>;
export const DivisionId = idConstructor<'DivisionId'>();

const MAX_LABEL_LEN = 60;
const MAX_TIER_LABEL_LEN = 40;
const MAX_TEAM_SIZE = 24;
const MAX_PRIZE_TEXT_LEN = 500;
const MAX_PRICE_CENTS = 1_000_000;

export interface CreateDivisionProps {
  id: DivisionId;
  sortOrder: number;
  label: string;
  surface: Surface;
  format: Format;
  gender: Gender;
  skillTier: SkillTier;
  ageGroup?: AgeGroup;
  /** Optional free-form override when the structured tier is insufficient. */
  tierLabel?: string | null;
  teamComposition?: TeamComposition;
  /** Required when {@link teamComposition} is `Partners` or `PairDraw`. */
  teamSize?: number | null;
  /** Per-division capacity. `null` = inherit event-level capacity. */
  capacity?: Capacity | null;
  /** Per-division price. `null` = inherit `event.priceCents` at `PerPlayer`. */
  priceCents?: number | null;
  priceUnit?: PriceUnit;
  prizeText?: string | null;
  prizePurseCents?: number | null;
  /** Optional schedule override for multi-day tournaments. */
  startsAt?: Date | null;
  endsAt?: Date | null;
  /**
   * When `false`, the division does not accept free-agent signups. Hosts
   * running pure captain-assembled brackets use this to hide the free-agent
   * pool. Defaults to `true`.
   */
  allowFreeAgents?: boolean;
  /**
   * ADR 0016 team paradigm at the division level. `null` = individual
   * signup (open-play or solo-bracket tournament); `'ad_hoc'` = captain
   * assembles a throwaway {@link EventTeamRegistration}; `'roster'` =
   * captain registers an existing persistent {@link Team}. Defaults to
   * `null` — the create-event handler upgrades non-solo tournament
   * divisions to `'ad_hoc'` when the host didn't pick a mode.
   */
  teamRegistrationMode?: TeamRegistrationMode | null;
}

/**
 * A division is the playable bracket within an event: format × gender ×
 * skill × age × capacity × price × prize. One event has 1..N divisions.
 *
 * Modeled as a value-shaped entity inside the {@link VolleyballEvent}
 * aggregate. Mutations go through the event so the aggregate stays
 * authoritative.
 */
export class Division {
  private constructor(
    public readonly id: DivisionId,
    public readonly sortOrder: number,
    public readonly label: string,
    public readonly surface: Surface,
    public readonly format: Format,
    public readonly gender: Gender,
    public readonly skillTier: SkillTier,
    public readonly ageGroup: AgeGroup,
    public readonly tierLabel: string | null,
    public readonly teamComposition: TeamComposition,
    public readonly teamSize: number | null,
    public readonly capacity: Capacity | null,
    public readonly priceCents: number | null,
    public readonly priceUnit: PriceUnit,
    public readonly prizeText: string | null,
    public readonly prizePurseCents: number | null,
    public readonly startsAt: Date | null,
    public readonly endsAt: Date | null,
    public readonly allowFreeAgents: boolean,
    public readonly teamRegistrationMode: TeamRegistrationMode | null,
  ) {}

  /**
   * Validate inputs and produce a new `Division`. Throws
   * {@link InvariantViolation} on empty / too-long label or invalid
   * `sortOrder`, and rejects via `assertFormatAllowedForSurface` when
   * surface and format are incompatible.
   */
  static create(props: CreateDivisionProps): Division {
    const label = props.label.trim();
    if (!label) {
      throw new InvariantViolation('Division label is required.');
    }
    if (label.length > MAX_LABEL_LEN) {
      throw new InvariantViolation(`Division label must be at most ${MAX_LABEL_LEN} characters.`);
    }
    if (!Number.isInteger(props.sortOrder) || props.sortOrder < 0) {
      throw new InvariantViolation('Division sort order must be a non-negative integer.');
    }

    assertFormatAllowedForSurface(props.surface, props.format);

    const ageGroup = props.ageGroup ?? AgeGroup.Adult;
    const teamComposition = props.teamComposition ?? TeamComposition.Solo;
    const priceUnit = props.priceUnit ?? PriceUnit.PerPlayer;

    const tierLabel = props.tierLabel?.trim() || null;
    if (tierLabel && tierLabel.length > MAX_TIER_LABEL_LEN) {
      throw new InvariantViolation(`Tier label must be at most ${MAX_TIER_LABEL_LEN} characters.`);
    }

    const teamSize = props.teamSize ?? null;
    if (teamSize !== null) {
      if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > MAX_TEAM_SIZE) {
        throw new InvariantViolation(
          `Team size must be an integer between 1 and ${MAX_TEAM_SIZE}.`,
        );
      }
    }
    if (
      (teamComposition === TeamComposition.PairDraw ||
        teamComposition === TeamComposition.Partners) &&
      teamSize === null
    ) {
      throw new InvariantViolation(
        `Team size is required when team composition is "${teamComposition}".`,
      );
    }

    const priceCents = props.priceCents ?? null;
    if (priceCents !== null) {
      if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > MAX_PRICE_CENTS) {
        throw new InvariantViolation(
          `Division price must be a non-negative integer of cents (≤ ${MAX_PRICE_CENTS}).`,
        );
      }
    }

    const prizeText = props.prizeText?.trim() || null;
    if (prizeText && prizeText.length > MAX_PRIZE_TEXT_LEN) {
      throw new InvariantViolation(`Prize text must be at most ${MAX_PRIZE_TEXT_LEN} characters.`);
    }
    const prizePurseCents = props.prizePurseCents ?? null;
    if (prizePurseCents !== null) {
      if (!Number.isInteger(prizePurseCents) || prizePurseCents < 0) {
        throw new InvariantViolation('Prize purse must be a non-negative integer of cents.');
      }
    }

    const startsAt = props.startsAt ?? null;
    const endsAt = props.endsAt ?? null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new InvariantViolation('Division end time must be after start time.');
    }

    return new Division(
      props.id,
      props.sortOrder,
      label,
      props.surface,
      props.format,
      props.gender,
      props.skillTier,
      ageGroup,
      tierLabel,
      teamComposition,
      teamSize,
      props.capacity ?? null,
      priceCents,
      priceUnit,
      prizeText,
      prizePurseCents,
      startsAt,
      endsAt,
      props.allowFreeAgents ?? true,
      props.teamRegistrationMode ?? null,
    );
  }

  /**
   * Hydrate from persistence without invariant checks. Use only from
   * repository adapters reading already-validated rows.
   */
  static fromPersistence(props: {
    id: DivisionId;
    sortOrder: number;
    label: string;
    surface: Surface;
    format: Format;
    gender: Gender;
    skillTier: SkillTier;
    ageGroup: AgeGroup;
    tierLabel: string | null;
    teamComposition: TeamComposition;
    teamSize: number | null;
    capacity: Capacity | null;
    priceCents: number | null;
    priceUnit: PriceUnit;
    prizeText: string | null;
    prizePurseCents: number | null;
    startsAt: Date | null;
    endsAt: Date | null;
    allowFreeAgents: boolean;
    teamRegistrationMode: TeamRegistrationMode | null;
  }): Division {
    return new Division(
      props.id,
      props.sortOrder,
      props.label,
      props.surface,
      props.format,
      props.gender,
      props.skillTier,
      props.ageGroup,
      props.tierLabel,
      props.teamComposition,
      props.teamSize,
      props.capacity,
      props.priceCents,
      props.priceUnit,
      props.prizeText,
      props.prizePurseCents,
      props.startsAt,
      props.endsAt,
      props.allowFreeAgents,
      props.teamRegistrationMode,
    );
  }
}
