import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import { noAsNeverRule } from '@pickupvb/config/eslint/base';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      '.turbo/**',
      'next-env.d.ts',
      'tests/**',
      'scripts/**',
      'playwright.config.ts',
      '.playwright/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
    ],
  },
  ...next,
  ...nextCoreWebVitals,
  {
    rules: {
      // React 19 + react-hooks 7 introduced new strict rules. Demote to
      // warnings so the upgrade lands; address violations incrementally.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'import/no-anonymous-default-export': 'warn',
    },
  },
  {
    // M3 shape-scale ratchet (docs/audits/m3-alignment.md P2 #7, Bundle 139).
    //
    // Bundle 139 codemodded the *value-preserving* raw `rounded-*` classes to
    // the M3 shape scale (rounded-lg→rounded-shape-sm = 8px,
    // rounded-xl→rounded-shape-md = 12px, rounded-2xl→rounded-shape-lg = 16px).
    // These rules forbid re-introducing the eliminated classes so the
    // migration can't silently regress — "lock eliminated only" per the audit.
    //
    // Intentionally NOT forbidden: `rounded-md` (6px — no exact M3 token, needs
    // per-component role judgment) and `rounded-full` (maps 1:1 to shape-full;
    // `rounded-full` reads fine). Their ratchet lands WITH the role-aware
    // migration, not before it. The selectors match the class as a whole token
    // (start / space / variant-colon boundary) so `rounded-shape-lg` and
    // directional forms aren't false-positives.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noAsNeverRule,
        {
          selector: 'Literal[value=/(?:^|[\\s:])rounded-(?:lg|xl|2xl)(?![\\w-])/]',
          message:
            'Use the M3 shape scale (rounded-shape-sm = 8px, rounded-shape-md = 12px, rounded-shape-lg = 16px) instead of raw rounded-lg/xl/2xl. Eliminated in Bundle 139 — see docs/audits/m3-alignment.md P2 #7.',
        },
        {
          selector: 'TemplateElement[value.cooked=/(?:^|[\\s:])rounded-(?:lg|xl|2xl)(?![\\w-])/]',
          message:
            'Use the M3 shape scale (rounded-shape-sm/md/lg) instead of raw rounded-lg/xl/2xl in template literals. Eliminated in Bundle 139 — see docs/audits/m3-alignment.md P2 #7.',
        },
        // M3 type-scale ratchet (docs/audits/m3-alignment.md S1, 2026-06-07).
        //
        // The re-audit found the M3 type scale shipped in Bundle 129 but sat at
        // 0/15 roles adopted while raw `text-Nxl` GREW (77→120 in 8 days) for
        // lack of a guard. This bundle migrated every raw `text-Nxl` to a type
        // role and locks the now-eliminated family so it can't regress:
        //   text-xl→title-lg · text-2xl→headline-sm (exact 24/32) ·
        //   text-3xl→headline-lg · text-4xl→display-sm · text-5xl→display-md ·
        //   text-6xl→display-lg.
        // Lock-eliminated only (the family is at 0). Matches `text-xl` and
        // `text-{2..9}xl` as a whole token after a start/space/variant-colon
        // boundary, so `text-display-lg`, `text-headline-sm`, `text-title-lg`,
        // and the un-ratcheted `text-{sm,lg,xs,base}` are not false-positives.
        //
        // Intentionally NOT forbidden: `text-lg`/`text-sm`/`text-xs`/`text-base`
        // (1423 sites — a genuine flood; their type-role mapping is judgment,
        // not a 1:1, so their ratchet lands WITH that migration, not before).
        {
          selector: 'Literal[value=/(?:^|[\\s:])text-(?:xl|[2-9]xl)(?![\\w-])/]',
          message:
            'Use the M3 type scale (text-title-lg / text-headline-{sm,md,lg} / text-display-{sm,md,lg}) instead of raw text-xl/2xl/3xl/…. Eliminated 2026-06-07 — see docs/audits/m3-alignment.md S1.',
        },
        {
          selector: 'TemplateElement[value.cooked=/(?:^|[\\s:])text-(?:xl|[2-9]xl)(?![\\w-])/]',
          message:
            'Use the M3 type scale (text-title-lg / text-headline-* / text-display-*) instead of raw text-Nxl in template literals. Eliminated 2026-06-07 — see docs/audits/m3-alignment.md S1.',
        },
        // Field-vocabulary ratchet (docs/audits/persona-ux.md CC-2, Bundle
        // 2026-05-31b). Bundle 2 collapsed 17 forked local
        // `const inputClass`/`labelClass`/`selectClass = '…tailwind…'`
        // definitions onto the shared recipe in
        // `@/components/field-styles` (and `TextField`). These forbid
        // re-declaring a hand-rolled field class so the convergence can't
        // silently regress. Matches only a *string/template-literal* RHS, so
        // the re-exports in `form-primitives.tsx`
        // (`export const inputClass = fieldInputClass`) — Identifier RHS — and
        // the `field-styles.ts` source (`fieldInputClass`, different name) are
        // not flagged. Two surfaces opt out with `eslint-disable` + a reason
        // (event-filter-form's compact filter controls, match-row's inline
        // schedule-table cell) — they're a different control class than
        // labeled form fields.
        {
          selector:
            "VariableDeclarator[id.name=/^(input|label|select)Class$/][init.type='Literal']",
          message:
            "Don't hand-roll a field class string. Import fieldInputClass / fieldLabelClass / fieldSubLabelClass / fieldHintClass / fieldErrorClass from '@/components/field-styles' (or use <TextField>). See docs/audits/persona-ux.md CC-2.",
        },
        {
          selector:
            "VariableDeclarator[id.name=/^(input|label|select)Class$/][init.type='TemplateLiteral']",
          message:
            "Don't hand-roll a field class string. Import the field classes from '@/components/field-styles' (or use <TextField>). See docs/audits/persona-ux.md CC-2.",
        },
        // Primary-button ratchet (docs/audits/persona-ux.md CC-1, Bundle
        // 2026-05-31d). The CC-1 sweep migrated every hand-rolled
        // `bg-primary hover:bg-primary/90 … text-white` button to
        // `primaryButtonClass(size)` (the canonical M3 filled button uses the
        // `state-layer` overlay, never `hover:bg-primary/90`). `hover:bg-primary/90`
        // is therefore a reliable fingerprint of the old recipe — forbid it so it
        // can't re-enter. There are intentionally **no exceptions** (the sweep hit
        // zero remaining occurrences); a genuinely new filled-button surface should
        // import `primaryButtonClass` / `secondaryButtonClass` instead.
        {
          selector: 'Literal[value=/hover:bg-primary\\/90/]',
          message:
            "Don't hand-roll the primary-button recipe (`bg-primary hover:bg-primary/90 text-white …`). Use primaryButtonClass(size) / secondaryButtonClass(size) from '@/components/primary-button'. See docs/audits/persona-ux.md CC-1.",
        },
        {
          selector: 'TemplateElement[value.cooked=/hover:bg-primary\\/90/]',
          message:
            "Don't hand-roll the primary-button recipe in a template literal. Use primaryButtonClass / secondaryButtonClass from '@/components/primary-button'. See docs/audits/persona-ux.md CC-1.",
        },
        // CC-6 (docs/audits/persona-ux.md, Bundle 2026-06-01l): the `/90`
        // ratchet above missed a *second* hand-rolled filled-primary recipe —
        // `bg-primary … text-primary-fg … hover:opacity-90` — which slipped past
        // it 17 times. `hover:opacity-90` alone is legitimate (a subtle fade on
        // non-button row links, e.g. attendee-list / friends-list), so we forbid
        // only the *co-occurrence* of `bg-primary` + `hover:opacity-90` in one
        // class string (dual look-ahead, order-independent). A genuinely new
        // filled button must import primaryButtonClass.
        {
          selector: 'Literal[value=/^(?=[\\s\\S]*bg-primary)(?=[\\s\\S]*hover:opacity-90)/]',
          message:
            "Don't hand-roll a filled primary button with `bg-primary … hover:opacity-90` (it dodges the `/90` ratchet). Use primaryButtonClass(size) from '@/components/primary-button'. See docs/audits/persona-ux.md CC-6.",
        },
        {
          selector:
            'TemplateElement[value.cooked=/^(?=[\\s\\S]*bg-primary)(?=[\\s\\S]*hover:opacity-90)/]',
          message:
            "Don't hand-roll a filled primary button with `bg-primary … hover:opacity-90` in a template literal. Use primaryButtonClass(size) from '@/components/primary-button'. See docs/audits/persona-ux.md CC-6.",
        },
        // Table-header scope ratchet (docs/audits/accessibility.md 2026-06-02
        // A1). The original 2026-05-17 P1 added `scope="col"` to the receipts /
        // earnings / pricing tables, but the fix was per-table and nothing
        // guarded it — three *new* tables (standings tool, billing/analytics,
        // about/numbers) shipped headers with no `scope`, re-opening the same
        // 1.3.1 gap. This forbids a `<th>` with no `scope` attribute so every
        // header cell must declare `scope="col"` (column header) or
        // `scope="row"` (row header), and the regression can't silently recur.
        // A genuinely header-less cell in a header row should be a `<td>`, or
        // opt out with an `eslint-disable-next-line` + reason. (Spread-only
        // attributes — `<th {...props}>` — would also trip this; none exist.)
        {
          selector: "JSXOpeningElement[name.name='th']:not(:has(JSXAttribute[name.name='scope']))",
          message:
            'Every <th> needs an explicit scope ("col" for a column header, "row" for a row header) so screen readers associate data cells with their headers. Regression guard for the original accessibility P1 — see docs/audits/accessibility.md 2026-06-02 A1.',
        },
        // Dead `*-destructive` token ratchet (docs/audits/accessibility.md
        // 2026-06-08 C1). `destructive` is NOT a defined color role — only
        // `--color-md-error` is — so `text-destructive` / `hover:text-destructive`
        // emit no CSS under Tailwind v4 and silently no-op. That left several
        // upload / template error messages rendering with no error color (and no
        // `role="alert"`). Forbid any `*-destructive` utility so the pre-M3
        // leftover can't re-enter; use the defined `text-md-error` /
        // `hover:text-md-error` role token instead (AGENTS.md §17). Matches a
        // hyphen-prefixed `-destructive` utility, not the FormModal/confirm
        // `destructive` prop (a JSX identifier, not a class string).
        {
          selector: 'Literal[value=/(?:^|[\\s:])[a-z-]+-destructive(?![\\w-])/]',
          message:
            '`*-destructive` is an undefined token (it emits no CSS — a silent no-op). Use the defined M3 error role: `text-md-error` / `hover:text-md-error` / `bg-md-error-container`. See docs/audits/accessibility.md 2026-06-08 C1.',
        },
        {
          selector: 'TemplateElement[value.cooked=/(?:^|[\\s:])[a-z-]+-destructive(?![\\w-])/]',
          message:
            '`*-destructive` is an undefined token (it emits no CSS — a silent no-op). Use the defined M3 error role: `text-md-error` / `hover:text-md-error` / `bg-md-error-container`. See docs/audits/accessibility.md 2026-06-08 C1.',
        },
      ],
    },
  },
];

export default config;
