import {
  SURFACE_LABEL,
  FORMAT_LABEL,
  GENDER_LABEL,
  SKILL_LABEL,
  SKILL_TIER_LABEL,
  TYPE_LABEL,
  STATUS_LABEL,
} from '@/lib/enum-labels';

type Props = {
  type: string;
  surface: string;
  skillLevel: string;
  /**
   * Primary division's SkillTier (e.g. `bb3`). When present, replaces the
   * coarse legacy band label so the chip matches what the host picked on
   * the create/edit form. Falls back to `skillLevel` when null/undefined
   * (legacy rows without a division).
   */
  skillTier?: string | null;
  /** Optional override label from the division row (e.g. "BB-3 Adult"). */
  tierLabel?: string | null;
  format: string | null;
  gender: string | null;
  status: string;
  /**
   * Number of divisions on the event. When greater than 1 (a tournament
   * with multiple brackets), the skill / format / gender chips are
   * replaced with a single "{n} divisions" pill since those attributes
   * vary per division and the divisions section below covers the detail.
   */
  divisionCount?: number;
};

/**
 * Pill row of event metadata (type / surface / skill / format / gender) plus a
 * highlighted status pill when the event isn't in the normal "published"
 * state. Pure presentational — no data fetching.
 */
export function EventTags({
  type,
  surface,
  skillLevel,
  skillTier,
  tierLabel,
  format,
  gender,
  status,
  divisionCount,
}: Props) {
  const skillChip =
    tierLabel ??
    (skillTier ? (SKILL_TIER_LABEL[skillTier] ?? skillTier) : null) ??
    SKILL_LABEL[skillLevel] ??
    skillLevel;
  const isMultiDivision = (divisionCount ?? 0) > 1;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="bg-primary/15 text-primary rounded-full px-2 py-1 font-medium">
        {TYPE_LABEL[type] ?? type}
      </span>
      <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-1">
        {SURFACE_LABEL[surface] ?? surface}
      </span>
      {isMultiDivision ? (
        <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-1">{divisionCount} divisions</span>
      ) : (
        <>
          <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-1">{skillChip}</span>
          {format && (
            <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-1">
              {FORMAT_LABEL[format] ?? format}
            </span>
          )}
          {gender && (
            <span className="bg-fg/5 text-fg/80 rounded-full px-2 py-1">
              {GENDER_LABEL[gender] ?? gender}
            </span>
          )}
        </>
      )}
      {status !== 'published' && (
        <span className="bg-highlight text-highlight-fg rounded-full px-2 py-1 font-medium">
          {STATUS_LABEL[status] ?? status}
        </span>
      )}
    </div>
  );
}
