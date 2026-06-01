'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CreateGroupCommand, UpdateGroupProfileCommand } from '@pickupvb/application';
import { ConflictError, NotFoundError, ValidationError } from '@pickupvb/domain';
import { field } from '@/lib/form-data';
import { requireSession } from '@/lib/server-auth';
import { getGroupHandlers } from '@/lib/handlers';

export type GroupFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Map a field-tagged ValidationError from the Group aggregate to the form. */
function fieldErrorState(err: ValidationError): GroupFormState {
  const fieldName = (err.details as { field?: string } | undefined)?.field ?? 'name';
  return { error: 'Please fix the highlighted fields.', fieldErrors: { [fieldName]: err.message } };
}

export async function createGroupAction(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const { user } = await requireSession();

  const name = field(formData, 'name');
  const slug = field(formData, 'slug').toLowerCase();
  const description = field(formData, 'description');
  const homeCity = field(formData, 'home_city');
  const region = field(formData, 'region');

  let slugCreated: string;
  try {
    const { createGroup } = await getGroupHandlers();
    const created = await createGroup.execute(
      new CreateGroupCommand(user.id, {
        slug,
        name,
        description,
        homeCity: homeCity || null,
        region: region || null,
      }),
    );
    slugCreated = created.slug;
  } catch (err) {
    if (err instanceof ConflictError)
      return {
        error: 'That slug is taken — pick another.',
        fieldErrors: { slug: 'Already taken.' },
      };
    if (err instanceof ValidationError) return fieldErrorState(err);
    throw err;
  }

  revalidatePath('/groups');
  revalidatePath('/profile');
  redirect(`/groups/${slugCreated}`);
}

export async function updateGroupAction(
  groupId: string,
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  await requireSession();

  const name = field(formData, 'name');
  const description = field(formData, 'description');
  const homeCity = field(formData, 'home_city');
  const region = field(formData, 'region');

  let slug: string;
  try {
    const { updateGroupProfile } = await getGroupHandlers();
    const res = await updateGroupProfile.execute(
      new UpdateGroupProfileCommand(groupId, {
        name,
        description,
        homeCity: homeCity || null,
        region: region || null,
      }),
    );
    slug = res.slug;
  } catch (err) {
    if (err instanceof ValidationError) return fieldErrorState(err);
    if (err instanceof NotFoundError) return { error: 'Group not found.' };
    throw err;
  }

  // The handler returns the slug so we can revalidate the public URL.
  revalidatePath(`/groups/${slug}`);
  return {};
}
