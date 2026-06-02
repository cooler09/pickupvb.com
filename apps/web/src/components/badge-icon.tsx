import type { BadgeIcon } from '@pickupvb/domain';

/**
 * Inline athletic glyphs for the achievement badges. One stroke-based SVG per
 * `BadgeIcon` token from the domain catalog. `currentColor` so the badge tile
 * controls the colour via its tier treatment. Decorative — the badge tile
 * carries the accessible label, so each glyph is `aria-hidden`.
 */
export function BadgeGlyph({ icon, className }: { icon: BadgeIcon; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (icon) {
    case 'crown':
      return (
        <svg {...common}>
          <path d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 9h-13L4 8z" />
          <path d="M5.5 20h13" />
        </svg>
      );
    case 'medal':
      return (
        <svg {...common}>
          <path d="M8 3l2.5 5M16 3l-2.5 5" />
          <circle cx="12" cy="15" r="6" />
          <path d="M12 12.5l1 2 2 .2-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 14.7l2-.2 1-2z" />
        </svg>
      );
    case 'whistle':
      return (
        <svg {...common}>
          <path d="M3 11a4 4 0 014-4h10l4-2v8a4 4 0 01-4 4h-2.5A5.5 5.5 0 113 11z" />
          <circle cx="8.5" cy="12.5" r="2" />
        </svg>
      );
    case 'season':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 9h16M9 3v4M15 3v4" />
          <path d="M8 13l2.5 2.5L16 11" />
        </svg>
      );
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
        </svg>
      );
    case 'flame':
      return (
        <svg {...common}>
          <path d="M12 3c1 3-2 4-2 7a2 2 0 104 0c0-.8-.3-1.5-.5-2 1.8 1 3 3 3 5.2A4.7 4.7 0 0112 21a4.7 4.7 0 01-4.5-5C7.5 11 11 9 12 3z" />
        </svg>
      );
    case 'loyalty':
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.4-7-9.5A3.8 3.8 0 0112 8a3.8 3.8 0 017 2.5C19 15.6 12 20 12 20z" />
        </svg>
      );
    case 'sparkle':
      return (
        <svg {...common}>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
          <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
        </svg>
      );
  }
}
