/**
 * One-shot Material 3 tonal palette generator.
 *
 * Seeded from the existing brand colors (no Material-default purple). Run
 * with `pnpm tsx scripts/gen-palette.ts` (or `node --import tsx ...`) and
 * paste the printed CSS into [apps/web/src/app/globals.css] under the
 * "M3 color roles" block.
 *
 * Why a one-shot script instead of a build-time codegen: the brand seeds
 * change once a year at most, so generating on every build adds latency
 * + a runtime / build-time dependency for no reason. Keep the script in
 * source so the next person can regenerate; ship only the resulting CSS.
 *
 * See [docs/audits/m3-alignment.md] P1 #1.
 */
import { Hct, TonalPalette, argbFromHex, hexFromArgb } from '@material/material-color-utilities';

/** Brand seeds from globals.css (light theme). */
const SEEDS = {
  primary: '#439093', // teal
  secondary: '#F09B93', // coral
  tertiary: '#E9DD8A', // sand / highlight
  neutral: '#183334', // deep teal-gray (used to seed surfaces)
  neutralVariant: '#555F60', // muted
  error: '#DC2626', // red-600 (matches existing aria-invalid styling)
  // Custom semantic roles — M3 ships no warning/success role, but ~44% of the
  // app's raw palette was amber (caution) + emerald/green (positive). Seeded so
  // the generated container/on-container tones match the old hand-rolled
  // amber-50/900 + emerald-50/800 alert surfaces. See m3-alignment.md S2.
  warning: '#D97706', // amber-600
  success: '#059669', // emerald-600
} as const;

type RoleKey = keyof typeof SEEDS;

/** Generate a tonal palette (tones 0-100) from a hex seed. */
function tonalFromHex(hex: string): TonalPalette {
  return TonalPalette.fromHct(Hct.fromInt(argbFromHex(hex)));
}

/** Convert an ARGB int to an `R G B` triple string (for `rgb(var(--c) / a)`). */
function rgbTriple(argb: number): string {
  // Strip leading `#` then parse pairs.
  const hex = hexFromArgb(argb).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

const palettes: Record<RoleKey, TonalPalette> = {
  primary: tonalFromHex(SEEDS.primary),
  secondary: tonalFromHex(SEEDS.secondary),
  tertiary: tonalFromHex(SEEDS.tertiary),
  neutral: tonalFromHex(SEEDS.neutral),
  neutralVariant: tonalFromHex(SEEDS.neutralVariant),
  error: tonalFromHex(SEEDS.error),
  warning: tonalFromHex(SEEDS.warning),
  success: tonalFromHex(SEEDS.success),
};

/**
 * M3 light + dark role → tone mapping (from the M3 spec's "Color roles"
 * table). Each role pulls a tone from one of the six palettes above.
 */
const LIGHT_ROLES: Array<[role: string, palette: RoleKey, tone: number]> = [
  ['primary', 'primary', 40],
  ['on-primary', 'primary', 100],
  ['primary-container', 'primary', 90],
  ['on-primary-container', 'primary', 10],
  ['secondary', 'secondary', 40],
  ['on-secondary', 'secondary', 100],
  ['secondary-container', 'secondary', 90],
  ['on-secondary-container', 'secondary', 10],
  ['tertiary', 'tertiary', 40],
  ['on-tertiary', 'tertiary', 100],
  ['tertiary-container', 'tertiary', 90],
  ['on-tertiary-container', 'tertiary', 10],
  ['error', 'error', 40],
  ['on-error', 'error', 100],
  ['error-container', 'error', 90],
  ['on-error-container', 'error', 10],
  ['warning', 'warning', 40],
  ['on-warning', 'warning', 100],
  ['warning-container', 'warning', 90],
  ['on-warning-container', 'warning', 10],
  ['success', 'success', 40],
  ['on-success', 'success', 100],
  ['success-container', 'success', 90],
  ['on-success-container', 'success', 10],
  ['background', 'neutral', 98],
  ['on-background', 'neutral', 10],
  ['surface', 'neutral', 98],
  ['on-surface', 'neutral', 10],
  ['surface-variant', 'neutralVariant', 90],
  ['on-surface-variant', 'neutralVariant', 30],
  ['surface-container-lowest', 'neutral', 100],
  ['surface-container-low', 'neutral', 96],
  ['surface-container', 'neutral', 94],
  ['surface-container-high', 'neutral', 92],
  ['surface-container-highest', 'neutral', 90],
  ['outline', 'neutralVariant', 50],
  ['outline-variant', 'neutralVariant', 80],
  ['inverse-surface', 'neutral', 20],
  ['inverse-on-surface', 'neutral', 95],
  ['inverse-primary', 'primary', 80],
  ['scrim', 'neutral', 0],
  ['shadow', 'neutral', 0],
];

const DARK_ROLES: Array<[role: string, palette: RoleKey, tone: number]> = [
  ['primary', 'primary', 80],
  ['on-primary', 'primary', 20],
  ['primary-container', 'primary', 30],
  ['on-primary-container', 'primary', 90],
  ['secondary', 'secondary', 80],
  ['on-secondary', 'secondary', 20],
  ['secondary-container', 'secondary', 30],
  ['on-secondary-container', 'secondary', 90],
  ['tertiary', 'tertiary', 80],
  ['on-tertiary', 'tertiary', 20],
  ['tertiary-container', 'tertiary', 30],
  ['on-tertiary-container', 'tertiary', 90],
  ['error', 'error', 80],
  ['on-error', 'error', 20],
  ['error-container', 'error', 30],
  ['on-error-container', 'error', 90],
  ['warning', 'warning', 80],
  ['on-warning', 'warning', 20],
  ['warning-container', 'warning', 30],
  ['on-warning-container', 'warning', 90],
  ['success', 'success', 80],
  ['on-success', 'success', 20],
  ['success-container', 'success', 30],
  ['on-success-container', 'success', 90],
  ['background', 'neutral', 6],
  ['on-background', 'neutral', 90],
  ['surface', 'neutral', 6],
  ['on-surface', 'neutral', 90],
  ['surface-variant', 'neutralVariant', 30],
  ['on-surface-variant', 'neutralVariant', 80],
  ['surface-container-lowest', 'neutral', 4],
  ['surface-container-low', 'neutral', 10],
  ['surface-container', 'neutral', 12],
  ['surface-container-high', 'neutral', 17],
  ['surface-container-highest', 'neutral', 22],
  ['outline', 'neutralVariant', 60],
  ['outline-variant', 'neutralVariant', 30],
  ['inverse-surface', 'neutral', 90],
  ['inverse-on-surface', 'neutral', 20],
  ['inverse-primary', 'primary', 40],
  ['scrim', 'neutral', 0],
  ['shadow', 'neutral', 0],
];

function emit(roles: typeof LIGHT_ROLES): string {
  return roles
    .map(([role, paletteKey, tone]) => {
      const argb = palettes[paletteKey].tone(tone);
      return `  --md-sys-color-${role}: ${rgbTriple(argb)}; /* tone ${tone} */`;
    })
    .join('\n');
}

console.log(`/* Generated by scripts/gen-palette.ts on ${new Date().toISOString().slice(0, 10)}. */
/* Seeds: primary=${SEEDS.primary} secondary=${SEEDS.secondary} tertiary=${SEEDS.tertiary} */
/* Re-run with \`pnpm tsx scripts/gen-palette.ts\` after changing brand seeds. */

:root,
:root[data-theme='light'] {
${emit(LIGHT_ROLES)}
}

:root[data-theme='dark'] {
${emit(DARK_ROLES)}
}
`);
