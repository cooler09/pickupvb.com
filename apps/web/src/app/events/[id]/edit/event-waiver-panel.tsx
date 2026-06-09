import { getAdminSupabase } from '@/lib/supabase-admin';
import { listSignatures } from '@/lib/waivers';
import { SubmitButton } from '@/components/submit-button';
import {
  primaryButtonClass,
  neutralButtonClass,
  errorTextButtonClass,
} from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { fieldInputClass, fieldLabelClass, fieldHintClass } from '@/components/field-styles';
import {
  upsertWaiverFromForm,
  deleteWaiver,
  addManualSignatureFromForm,
  removeSignatureFromForm,
} from './waiver-actions';

/**
 * Host waiver panel on the event edit page (monetization O-9). Free for any
 * host. Author rules text and/or link your own waiver (external_url), and track
 * signatures — attendees acknowledge online, and the host can record who signed
 * in person at their discretion. Self-loads on the admin client (safe: the edit
 * page already gated `canManage`).
 */
export async function EventWaiverPanel({
  eventId,
  returnPath,
  flashCode,
  flashMsg,
}: {
  eventId: string;
  returnPath: string;
  flashCode?: string;
  flashMsg?: string;
}) {
  const { data } = await getAdminSupabase()
    .from('event_waivers')
    .select('title, body, external_url, version')
    .eq('event_id', eventId)
    .maybeSingle();
  const w = data as {
    title: string;
    body: string | null;
    external_url: string | null;
    version: number;
  } | null;
  const signatures = w ? await listSignatures(eventId) : [];

  return (
    <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-5">
      <div>
        <h3 className="text-fg font-semibold">Waiver &amp; signatures</h3>
        <p className="text-muted text-sm">
          Link your own waiver and/or paste rules text. Attendees can acknowledge it online, and you
          can record who signed in person. Free, and shown on the event page — it doesn&apos;t block
          sign-ups, and it isn&apos;t a substitute for your own legal waiver.
        </p>
      </div>

      {flashCode === 'saved' && <Alert variant="success">Saved.</Alert>}
      {flashCode === 'removed' && <Alert variant="success">Waiver removed.</Alert>}
      {flashCode === 'recorded' && <Alert variant="success">In-person signature recorded.</Alert>}
      {flashCode === 'sig_removed' && <Alert variant="success">Signature removed.</Alert>}
      {flashCode === 'unauthorized' && (
        <Alert variant="error">You can&apos;t manage this event.</Alert>
      )}
      {(flashCode === 'invalid' || flashCode === 'error') && (
        <Alert variant="error" title="Couldn’t save">
          {flashMsg || 'Please try again.'}
        </Alert>
      )}

      <form action={upsertWaiverFromForm.bind(null, eventId, returnPath)} className="space-y-3">
        <div>
          <label htmlFor="waiver_title" className={fieldLabelClass}>
            Title
          </label>
          <input
            id="waiver_title"
            name="title"
            required
            maxLength={120}
            defaultValue={w?.title ?? 'Waiver'}
            className={fieldInputClass}
          />
        </div>
        <div>
          <label htmlFor="waiver_url" className={fieldLabelClass}>
            Link to your waiver <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="waiver_url"
            name="external_url"
            type="url"
            maxLength={500}
            placeholder="https://… (your PDF, DocuSign, sanctioning-body waiver)"
            defaultValue={w?.external_url ?? ''}
            className={fieldInputClass}
          />
        </div>
        <div>
          <label htmlFor="waiver_body" className={fieldLabelClass}>
            Waiver / rules text <span className="text-muted font-normal">(optional)</span>
          </label>
          <textarea
            id="waiver_body"
            name="body"
            rows={5}
            maxLength={10000}
            defaultValue={w?.body ?? ''}
            placeholder="House rules, code of conduct, or the waiver text attendees acknowledge…"
            className={fieldInputClass}
          />
          <p className={fieldHintClass}>
            Add a link, text, or both. Editing the text bumps the version; people who acknowledged
            an older version are prompted to re-sign.
          </p>
        </div>
        <SubmitButton className={primaryButtonClass('sm')} pendingChildren="Saving…">
          {w ? 'Save waiver' : 'Add waiver'}
        </SubmitButton>
      </form>

      {w && (
        <div className="border-border-base space-y-3 border-t pt-3">
          <h4 className="text-fg text-sm font-semibold">
            Signatures{' '}
            <span className="text-muted font-normal">
              ({signatures.length} · current version v{w.version})
            </span>
          </h4>

          {signatures.length > 0 && (
            <ul className="space-y-1.5">
              {signatures.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="text-fg">{s.signedName}</span>{' '}
                    <span className="bg-fg/10 text-muted ml-1 rounded-full px-1.5 py-0.5 text-xs">
                      {s.method === 'in_person' ? 'In person' : 'Online'}
                    </span>{' '}
                    <span className="text-muted text-xs">
                      {new Date(s.signedAt).toLocaleDateString()}
                      {s.waiverVersion !== w.version ? ` · v${s.waiverVersion}` : ''}
                    </span>
                  </span>
                  <form action={removeSignatureFromForm.bind(null, eventId, s.id, returnPath)}>
                    <SubmitButton className={errorTextButtonClass('sm')} pendingChildren="…">
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form
            action={addManualSignatureFromForm.bind(null, eventId, returnPath)}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="grow">
              <label htmlFor="manual_sig_name" className={fieldLabelClass}>
                Record an in-person signature
              </label>
              <input
                id="manual_sig_name"
                name="name"
                maxLength={120}
                required
                placeholder="Name of who signed on paper"
                className={fieldInputClass}
              />
            </div>
            <SubmitButton className={neutralButtonClass('sm')} pendingChildren="…">
              Add
            </SubmitButton>
          </form>
        </div>
      )}

      {w && (
        <form action={deleteWaiver.bind(null, eventId, returnPath)}>
          <SubmitButton className={errorTextButtonClass('sm')} pendingChildren="…">
            Remove waiver
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
