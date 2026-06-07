'use client';

/**
 * Saved-templates affordance for the create-event form (architecture audit
 * P3-1 — decompose `new-event-form.tsx`). Pro-only.
 *
 * Templates are a power-user convenience, not part of the core create flow, so
 * this renders as a slim, right-aligned opt-in trigger rather than a card at
 * the top of the form — a host who never wants a template never has to engage
 * with one. The trigger opens a `FormModal` holding both actions:
 *   - **Apply** a saved setup (navigates to `?template=<id>`, which re-seeds
 *     the form server-side — see the remount `key` in page.tsx).
 *   - **Save** the current form as a new template (snapshots the parent
 *     `<form>` via `formRef`).
 *
 * Why `router.push` for Apply instead of the old GET `<form>` submit: the
 * modal body is portalled out of the `<form>` by Radix, so a `formMethod="get"`
 * submit button is no longer associated with the form. A push to the same
 * route with the `template` param is cleaner anyway (no whole-form
 * serialization into the URL) and drives the same server re-seed.
 *
 * Self-contained — it owns its own picker / transition / name-error state and
 * snapshots the parent `<form>` via the passed `formRef`; it doesn't touch the
 * rest of the form's React state.
 */
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type RefObject } from 'react';
import { FormModal } from '@/components/form-modal';
import { saveEventTemplateFromForm, deleteEventTemplate } from '../template-actions';
import { cardSubClass } from './form-primitives';

const triggerClass =
  'border-border-base text-fg/80 hover:bg-fg/5 focus-visible:ring-primary inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

function TemplateIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 opacity-70">
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3H9a1.5 1.5 0 0 1 1.5 1.5V7A1.5 1.5 0 0 1 9 8.5H4.5A1.5 1.5 0 0 1 3 7V4.5ZM3 12a1.5 1.5 0 0 1 1.5-1.5H9A1.5 1.5 0 0 1 10.5 12v3.5A1.5 1.5 0 0 1 9 17H4.5A1.5 1.5 0 0 1 3 15.5V12ZM12.5 4.5A1.5 1.5 0 0 1 14 3h1.5A1.5 1.5 0 0 1 17 4.5v3.5A1.5 1.5 0 0 1 15.5 9.5H14A1.5 1.5 0 0 1 12.5 8V4.5ZM12.5 13a1.5 1.5 0 0 1 1.5-1.5h1.5A1.5 1.5 0 0 1 17 13v2.5A1.5 1.5 0 0 1 15.5 17H14a1.5 1.5 0 0 1-1.5-1.5V13Z" />
    </svg>
  );
}

export default function TemplatesSection({
  templates,
  templateStatus,
  viewerHasProBenefits,
  formRef,
}: {
  templates: { id: string; name: string }[];
  selectedTemplateId?: string;
  templateStatus?: string;
  viewerHasProBenefits: boolean;
  formRef: RefObject<HTMLFormElement | null>;
}) {
  const router = useRouter();
  const templateNameRef = useRef<HTMLInputElement>(null);
  const [isSavingTemplate, startSaveTemplate] = useTransition();
  const [isDeletingTemplate, startDeleteTemplate] = useTransition();
  const [pickedTemplate, setPickedTemplate] = useState('');
  const [templateNameError, setTemplateNameError] = useState<string | null>(null);

  // Non-Pro hosts get a subtle, right-aligned upsell rather than a control —
  // discoverable, but it never competes with the form itself.
  if (!viewerHasProBenefits) {
    return (
      <div className="flex justify-end">
        <Link href="/pricing" className="text-muted hover:text-primary text-sm">
          Save &amp; reuse event setups with Pro
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {/* Save feedback surfaces here (not inside the modal): a successful save
          redirects to `?template=…&template_status=saved`, which remounts the
          page and closes the modal, so the confirmation has to live on the
          form. */}
      {templateStatus === 'saved' && (
        <span className="text-md-success text-sm">✓ Template saved</span>
      )}
      {templateStatus === 'error' && (
        <span className="text-destructive text-sm">Could not save template</span>
      )}

      <FormModal
        trigger={(open) => (
          <button type="button" onClick={open} className={triggerClass}>
            <TemplateIcon />
            Templates
          </button>
        )}
        title="Event templates"
        description="Apply a saved setup to prefill this form, or save what you've entered as a reusable template."
      >
        {(close) => (
          <div className="space-y-5">
            {/* Apply an existing template */}
            <div className="space-y-2">
              <p className={cardSubClass}>
                {templates.length > 0
                  ? 'Apply a saved setup, then tweak before creating.'
                  : 'No saved templates yet — save one below to reuse it next time.'}
              </p>
              {templates.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Saved template"
                    value={pickedTemplate}
                    onChange={(e) => setPickedTemplate(e.target.value)}
                    className="border-border-base bg-md-surface-container text-fg focus:border-primary focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    <option value="">Choose saved template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!pickedTemplate}
                    onClick={() => {
                      // Same-route navigation with the `template` param; the
                      // page re-seeds the form server-side and remounts it
                      // (see the `key` in page.tsx).
                      router.push(`/events/new?template=${pickedTemplate}` as Route);
                      close();
                    }}
                    className="border-border-base text-fg hover:bg-fg/5 focus-visible:ring-primary rounded-md border px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40"
                  >
                    Apply
                  </button>
                  {pickedTemplate && (
                    <button
                      type="button"
                      disabled={isDeletingTemplate}
                      onClick={() => {
                        startDeleteTemplate(async () => {
                          await deleteEventTemplate(pickedTemplate);
                        });
                      }}
                      className="text-muted hover:text-destructive focus-visible:ring-primary rounded text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-60"
                    >
                      {isDeletingTemplate ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Save current form as a new template */}
            <div className="border-border-base border-t pt-4">
              <p className={`${cardSubClass} mb-2`}>Save current form as a template</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={templateNameRef}
                  type="text"
                  placeholder="Template name"
                  className="border-border-base bg-md-surface-container text-fg focus:border-primary focus-visible:ring-primary w-44 rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  onChange={() => setTemplateNameError(null)}
                />
                <button
                  type="button"
                  disabled={isSavingTemplate}
                  onClick={() => {
                    const name = templateNameRef.current?.value.trim() ?? '';
                    if (!name) {
                      setTemplateNameError('Enter a name first.');
                      templateNameRef.current?.focus();
                      return;
                    }
                    setTemplateNameError(null);
                    const fd = formRef.current ? new FormData(formRef.current) : new FormData();
                    fd.set('templateName', name);
                    fd.delete('template');
                    startSaveTemplate(async () => {
                      await saveEventTemplateFromForm(fd);
                    });
                  }}
                  className="border-border-base text-fg hover:bg-fg/5 focus-visible:ring-primary rounded-md border px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {isSavingTemplate ? 'Saving…' : 'Save template'}
                </button>
              </div>
              {templateNameError && (
                <p className="text-destructive mt-1 text-xs">{templateNameError}</p>
              )}
            </div>
          </div>
        )}
      </FormModal>
    </div>
  );
}
