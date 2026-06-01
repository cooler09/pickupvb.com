import Link from 'next/link';
import type { Route } from 'next';
import {
  SURFACE_LABEL,
  TYPE_LABEL,
  SKILL_LABEL,
  AGE_GROUP_LABEL,
  TEAM_COMPOSITION_LABEL,
} from '@/lib/enum-labels';
import type {
  AgeGroupFilter,
  Skill,
  Surface,
  TeamCompositionFilter,
  Type,
} from './event-filter-options';
import type { Timeframe } from './event-timeframe-tabs';

type Props = {
  when: Timeframe;
  surface: Surface | undefined;
  type: Type | undefined;
  skillBand: Skill | undefined;
  ageGroup: AgeGroupFilter | undefined;
  teamComposition: TeamCompositionFilter | undefined;
  seriesName: string | undefined;
  location: { lat: number; lng: number; radiusKm: number } | null;
  /** Returns the page href with the named filter removed. */
  buildRemoveHref: (key: FilterKey) => Route;
  /** Returns the page href with ALL filters removed (preserves the current tab). */
  clearAllHref: Route;
};

export type FilterKey =
  | 'surface'
  | 'type'
  | 'skillBand'
  | 'ageGroup'
  | 'teamComposition'
  | 'seriesName'
  | 'location';

/**
 * Shows the active filter values as removable chips above the results.
 * Each chip is a link that navigates to the same page minus that filter.
 */
export function ActiveFilterChips({
  surface,
  type,
  skillBand,
  ageGroup,
  teamComposition,
  seriesName,
  location,
  buildRemoveHref,
  clearAllHref,
}: Props) {
  const chips: { key: FilterKey; label: string }[] = [];
  if (surface) chips.push({ key: 'surface', label: SURFACE_LABEL[surface] ?? surface });
  if (type) chips.push({ key: 'type', label: TYPE_LABEL[type] ?? type });
  if (skillBand) chips.push({ key: 'skillBand', label: SKILL_LABEL[skillBand] ?? skillBand });
  if (ageGroup) chips.push({ key: 'ageGroup', label: AGE_GROUP_LABEL[ageGroup] ?? ageGroup });
  if (teamComposition)
    chips.push({
      key: 'teamComposition',
      label: TEAM_COMPOSITION_LABEL[teamComposition] ?? teamComposition,
    });
  if (seriesName) chips.push({ key: 'seriesName', label: `Series: ${seriesName}` });
  if (location) chips.push({ key: 'location', label: `Within ${location.radiusKm} km` });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={buildRemoveHref(chip.key)}
          className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium"
          aria-label={`Remove filter ${chip.label}`}
        >
          <span>{chip.label}</span>
          <span aria-hidden>×</span>
        </Link>
      ))}
      {chips.length > 1 && (
        <Link
          href={clearAllHref}
          className="text-muted hover:text-primary text-xs underline-offset-2 hover:underline"
        >
          Clear all
        </Link>
      )}
    </div>
  );
}
