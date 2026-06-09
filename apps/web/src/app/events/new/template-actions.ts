'use server';

import { redirect } from 'next/navigation';
import { hasProBenefits } from '@/lib/admin';
import { field } from '@/lib/form-data';
import { requireRealUser } from '@/lib/server-auth';

export async function deleteEventTemplate(id: string): Promise<never> {
  const { user, supabase } = await requireRealUser('/events/new');
  const pro = await hasProBenefits(user.id);
  if (!pro) redirect('/events/new');
  await supabase.from('host_event_templates').delete().eq('id', id).eq('user_id', user.id);
  redirect('/events/new');
}

// One-off, event-specific fields excluded from a saved template. A template is
// for reusable setup (format, pricing, location, divisions) — not the specific
// title or date/time of the event it was captured from. Re-seeding a stale
// `title` and a past `startsAt` on apply was a footgun (CE-1).
const TEMPLATE_OMIT_FIELDS = new Set(['title', 'startsAt', 'endsAt', 'registrationClosesAt']);

function toPayload(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== 'string') continue;
    if (k === 'templateName') continue;
    if (k.startsWith('$ACTION_')) continue;
    if (TEMPLATE_OMIT_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function saveEventTemplateFromForm(formData: FormData): Promise<never> {
  const { user, supabase } = await requireRealUser('/events/new');

  const pro = await hasProBenefits(user.id);
  if (!pro) redirect('/events/new?template_status=pro');

  const name = field(formData, 'templateName');
  if (!name) redirect('/events/new?template_status=invalid');

  const payload = toPayload(formData);

  const { data, error } = await supabase
    .from('host_event_templates')
    .insert({
      user_id: user.id,
      name: name.slice(0, 80),
      payload,
    })
    .select('id')
    .single();

  if (error || !data) {
    redirect('/events/new?template_status=error');
  }

  const id = (data as { id: string }).id;
  redirect(`/events/new?template=${id}&template_status=saved`);
}
