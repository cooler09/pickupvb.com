/**
 * Lightweight inline-stroked SVG icons for marketing pages. Same visual
 * language as the header (stroke=currentColor, 24×24 viewbox). Add to this
 * set when new icons are needed; avoid pulling in a full icon library.
 */
import type { SVGProps } from 'react';

type IconName =
    | 'volleyball'
    | 'beach'
    | 'users'
    | 'lightning'
    | 'trophy'
    | 'check';

const PATHS: Record<IconName, React.ReactNode> = {
    // Volleyball: circle with three curved seams.
    volleyball: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3a14 14 0 0 0 0 18" />
            <path d="M3 12a14 14 0 0 0 18 0" />
            <path d="M5 6a14 14 0 0 1 14 12" />
        </>
    ),
    // Beach: sun + horizon line.
    beach: (
        <>
            <circle cx="12" cy="10" r="3.2" />
            <path d="M12 4v1.5M12 14.5V16M4 10h1.5M18.5 10H20M6.3 4.3l1.1 1.1M16.6 14.6l1.1 1.1M6.3 15.7l1.1-1.1M16.6 5.4l1.1-1.1" />
            <path d="M3 20h18" />
        </>
    ),
    // Two people.
    users: (
        <>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20a6 6 0 0 1 12 0" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M15 20a5 5 0 0 1 6.5-4.8" />
        </>
    ),
    // Lightning bolt.
    lightning: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
    // Trophy.
    trophy: (
        <>
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
            <path d="M17 5h2a2 2 0 0 1 0 4h-2M7 5H5a2 2 0 0 0 0 4h2" />
        </>
    ),
    check: <path d="m5 12 4 4 10-10" />,
};

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 20, className, ...rest }: Props) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={className}
            {...rest}
        >
            {PATHS[name]}
        </svg>
    );
}
