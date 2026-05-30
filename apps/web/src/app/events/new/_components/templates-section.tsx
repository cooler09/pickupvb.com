'use client';

/**
 * Saved-templates card for the create-event form (architecture audit P3-1 —
 * decompose `new-event-form.tsx`). Pro-only: apply a saved setup, save the
 * current form as a template, or remove one. Self-contained — it owns its own
 * picker / transition / name-error state and snapshots the parent `<form>` via
 * the passed `formRef`; it doesn't touch the rest of the form's React state.
 */
import Link from 'next/link';
import { useRef, useState, useTransition, type RefObject } from 'react';
import { saveEventTemplateFromForm, deleteEventTemplate } from '../template-actions';
import { cardClass, cardSubClass, cardTitleClass } from './form-primitives';

export default function TemplatesSection({
  templates,
  selectedTemplateId,
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
  const templateNameRef = useRef<HTMLInputElement>(null);
  const [isSavingTemplate, startSaveTemplate] = useTransition();
  const [isDeletingTemplate, startDeleteTemplate] = useTransition();
  const [pickedTemplate, setPickedTemplate] = useState(selectedTemplateId ?? '');
  const [templateNameError, setTemplateNameError] = useState<string | null>(null);

  if (!viewerHasProBenefits) {
    return (
      <p className="text-muted text-sm">
        Save and reuse event templates with{' '}
        <Link href="/pricing" className="text-primary underline">
          Pro
        </Link>
        .
      </p>
    );
  }

  return (
    <section className={cardClass}>
      <h2 className={cardTitleClass}>Saved templates</h2>

      {/* Status feedback */}
      {templateStatus === 'saved' && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          Template saved.
        </div>
      )}
      {templateStatus === 'error' && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Could not save template.
        </div>
      )}

      {/* Apply an existing template */}
      {templates.length > 0 && (
        <div className="space-y-2">
          <p className={cardSubClass}>Apply a saved setup, then tweak before creating.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="template"
              name="template"
              value={pickedTemplate}
              onChange={(e) => setPickedTemplate(e.target.value)}
              className="border-border-base bg-surface text-fg focus:border-primary focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <option value="">Choose saved template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              formAction="/events/new"
              formMethod="get"
              // The Apply button lives inside the main createEventAction form,
              // which has `required` fields (title, etc.). Without
              // formNoValidate the browser runs HTML5 constraint validation
              // on submit and blocks the GET navigation when those fields
              // are empty — which is the common case on a fresh /events/new.
              formNoValidate
              disabled={!pickedTemplate}
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
        </div>
      )}

      {/* Save current form as a new template */}
      <div className={templates.length > 0 ? 'border-border-base border-t pt-4' : ''}>
        <p className={`${cardSubClass} mb-2`}>Save current form as a template</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={templateNameRef}
            type="text"
            placeholder="Template name"
            className="border-border-base bg-surface text-fg focus:border-primary focus-visible:ring-primary w-44 rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
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
        {templateNameError && <p className="text-destructive mt-1 text-xs">{templateNameError}</p>}
      </div>
    </section>
  );
}
