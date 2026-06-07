import { secondaryButtonClass } from '@/components/primary-button';
import { EventFilterForm, type EventFilterFormProps } from './event-filter-form';

/**
 * Collapsible "Filters" trigger wrapping the {@link EventFilterForm}. Collapsed
 * by default so the results sit higher; the active-filter count rides the
 * trigger and the chips below stay visible as the summary. Native `<details>`
 * keeps the no-JS path working. Extracted from events/page.tsx (audit P3-1).
 */
export function EventFiltersDisclosure({
  activeFilterCount,
  ...filters
}: EventFilterFormProps & { activeFilterCount: number }) {
  return (
    <details className="group/panel">
      <summary
        className={`${secondaryButtonClass('sm')} w-fit cursor-pointer list-none gap-1.5 select-none`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        Filters
        {activeFilterCount > 0 && (
          <span className="bg-primary text-primary-fg rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
            {activeFilterCount}
          </span>
        )}
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3 w-3 transition-transform group-open/panel:rotate-180"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </summary>
      <div className="mt-3">
        <EventFilterForm {...filters} />
      </div>
    </details>
  );
}
