'use server';

import { redirect } from 'next/navigation';
import { hasProBenefits } from '@/lib/admin';
import { field } from '@/lib/form-data';
import { requireRealUser } from '@/lib/server-auth';

function toPayload(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== 'string') continue;
    if (k === 'templateName') continue;
    if (k.startsWith('$ACTION_')) continue;
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
    } as never)
    .select('id')
    .single();

  if (error || !data) {
    redirect('/events/new?template_status=error');
  }

  const id = (data as { id: string }).id;
  redirect(`/events/new?template=${id}&template_status=saved`);
}
