import {
    SURFACE_LABEL,
    FORMAT_LABEL,
    GENDER_LABEL,
    SKILL_LABEL,
    TYPE_LABEL,
    STATUS_LABEL,
} from '@/lib/enum-labels';

type Props = {
    type: string;
    surface: string;
    skillLevel: string;
    format: string | null;
    gender: string | null;
    status: string;
};

/**
 * Pill row of event metadata (type / surface / skill / format / gender) plus a
 * highlighted status pill when the event isn't in the normal "published"
 * state. Pure presentational — no data fetching.
 */
export function EventTags({ type, surface, skillLevel, format, gender, status }: Props) {
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-primary/15 px-2 py-1 font-medium text-primary">
                {TYPE_LABEL[type] ?? type}
            </span>
            <span className="rounded-full bg-fg/5 px-2 py-1 text-fg/80">
                {SURFACE_LABEL[surface] ?? surface}
            </span>
            <span className="rounded-full bg-fg/5 px-2 py-1 text-fg/80">
                {SKILL_LABEL[skillLevel] ?? skillLevel}
            </span>
            {format && (
                <span className="rounded-full bg-fg/5 px-2 py-1 text-fg/80">
                    {FORMAT_LABEL[format] ?? format}
                </span>
            )}
            {gender && (
                <span className="rounded-full bg-fg/5 px-2 py-1 text-fg/80">
                    {GENDER_LABEL[gender] ?? gender}
                </span>
            )}
            {status !== 'published' && (
                <span className="rounded-full bg-highlight px-2 py-1 font-medium text-highlight-fg">
                    {STATUS_LABEL[status] ?? status}
                </span>
            )}
        </div>
    );
}
