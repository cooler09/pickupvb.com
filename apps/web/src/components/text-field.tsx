'use client';

import {
  forwardRef,
  useId,
  type ForwardedRef,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';

/**
 * M3 outlined text field primitive (P2 #13, Bundle 7).
 *
 * Wraps a labelled `<input>` (or `<textarea>` when `multiline`) in an
 * outlined chassis that owns:
 *
 * - **Top-aligned label** — kept top-aligned rather than floating-in-border
 *   to match the current site aesthetic (the audit explicitly preferred
 *   outlined-no-floating over the "very Material" filled-with-floating
 *   default).
 * - **Supporting text slot** — helper copy under the field; collapses to
 *   the error message when the field has a `fieldErrors` entry. Wired to
 *   `aria-describedby` automatically.
 * - **Leading / trailing icon slots** — positioned inside the bordered
 *   chassis, vertically centered, with the input's horizontal padding
 *   pushed in to clear them. `aria-hidden` is the caller's call.
 * - **Prefix / suffix text adornments** — `$`, `.com`, unit labels. Take
 *   the same vertical-center treatment but no padding adjustment.
 * - **Auto-wired a11y** — composes `fieldA11y(name, errors)` with the
 *   supporting-text id so screen readers announce helper / error copy
 *   without callers having to remember the wiring.
 *
 * Migration is opt-in: existing `<input>` + `<FieldError>` call sites
 * keep working until ported, surface-by-surface, per the audit's plan.
 *
 * Usage:
 *
 *   <TextField
 *     name="name"
 *     label="Team name"
 *     errors={state.fieldErrors}
 *     supportingText="Shown on rosters and brackets."
 *     required
 *     maxLength={80}
 *   />
 */
type SharedFieldProps = {
  /** Form field name. Drives `id`, `name`, error lookup, a11y wiring. */
  name: string;
  /** Top-aligned `<label>` text. Always rendered. */
  label: string;
  /** `state.fieldErrors` map. When `errors[name]` is set the chassis paints the error state. */
  errors?: Record<string, string> | undefined;
  /** Helper copy under the field. Hidden when an error is shown. */
  supportingText?: ReactNode;
  /** Icon inside the chassis on the leading edge. */
  leadingIcon?: ReactNode;
  /** Icon inside the chassis on the trailing edge. */
  trailingIcon?: ReactNode;
  /** Static text adornment on the leading edge (`$`, `+1`, …). */
  prefix?: ReactNode;
  /** Static text adornment on the trailing edge (`.com`, `kg`, …). */
  suffix?: ReactNode;
};

type SingleLineProps = SharedFieldProps & {
  multiline?: false;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'name'>;

type MultilineProps = SharedFieldProps & {
  multiline: true;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'name'>;

export type TextFieldProps = SingleLineProps | MultilineProps;

// Chassis classes that paint the M3 outlined surface. Pulled out so the
// single-line and multiline branches share the recipe verbatim.
const chassisBase =
  'flex w-full items-center gap-2 rounded-md border bg-surface text-sm text-fg transition-colors focus-within:ring-2 focus-within:ring-offset-2';
const chassisIdle =
  'border-border-base focus-within:border-md-primary focus-within:ring-md-primary';
const chassisError = 'border-red-600 focus-within:border-red-600 focus-within:ring-red-600';

function inputPadding(hasLeading: boolean, hasTrailing: boolean): string {
  // The chassis owns the vertical padding so leading/trailing
  // adornments share the centerline; the input itself only pads the
  // horizontal edge it actually touches.
  const left = hasLeading ? 'pl-0' : 'pl-3';
  const right = hasTrailing ? 'pr-0' : 'pr-3';
  return `${left} ${right} py-2`;
}

export const TextField = forwardRef(function TextField(
  props: TextFieldProps,
  ref: ForwardedRef<HTMLInputElement | HTMLTextAreaElement>,
) {
  const {
    name,
    label,
    errors,
    supportingText,
    leadingIcon,
    trailingIcon,
    prefix,
    suffix,
    multiline,
    className,
    id: idProp,
    ...rest
  } = props as SharedFieldProps & {
    multiline?: boolean;
    className?: string;
    id?: string;
  } & Record<string, unknown>;

  const generatedId = useId();
  const id = idProp ?? `${name}-${generatedId}`;
  const supportId = `${id}-support`;
  const errorMsg = errors?.[name];
  const hasError = Boolean(errorMsg);
  const helperVisible = !hasError && Boolean(supportingText);
  const hasLeading = Boolean(leadingIcon || prefix);
  const hasTrailing = Boolean(trailingIcon || suffix);
  // `aria-describedby` always points at the supporting-text node when
  // either helper or error copy is showing; React renders the same
  // element id and swaps its content.
  const describedBy = hasError || helperVisible ? supportId : undefined;

  const chassisClass = `${chassisBase} ${hasError ? chassisError : chassisIdle} ${className ?? ''}`;
  const fieldClass = `flex-1 bg-transparent outline-none placeholder:text-fg/40 ${inputPadding(hasLeading, hasTrailing)}`;

  return (
    <div>
      <label htmlFor={id} className="text-fg block text-sm font-medium">
        {label}
      </label>
      <div className={`mt-1 ${chassisClass}`}>
        {leadingIcon && (
          <span className="text-fg/60 pl-3" aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        {prefix && <span className="text-muted pl-3 text-sm">{prefix}</span>}
        {multiline ? (
          <textarea
            id={id}
            name={name}
            ref={ref as Ref<HTMLTextAreaElement>}
            aria-invalid={hasError || undefined}
            {...(describedBy ? { 'aria-describedby': describedBy } : {})}
            className={fieldClass}
            {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            id={id}
            name={name}
            ref={ref as Ref<HTMLInputElement>}
            aria-invalid={hasError || undefined}
            {...(describedBy ? { 'aria-describedby': describedBy } : {})}
            className={fieldClass}
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
        {suffix && <span className="text-muted pr-3 text-sm">{suffix}</span>}
        {trailingIcon && (
          <span className="text-fg/60 pr-3" aria-hidden="true">
            {trailingIcon}
          </span>
        )}
      </div>
      {(hasError || helperVisible) && (
        <p
          id={supportId}
          // role="alert" only when we're showing an error message —
          // helper copy shouldn't preempt the screen reader.
          {...(hasError ? { role: 'alert' } : {})}
          className={`mt-1 text-xs ${hasError ? 'text-red-600' : 'text-muted'}`}
        >
          {hasError ? errorMsg : supportingText}
        </p>
      )}
    </div>
  );
});
