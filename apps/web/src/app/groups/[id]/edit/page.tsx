import { notFound, redirect } from 'next/navigation';
import { SupabaseGroupQueryRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import EditGroupForm from './edit-group-form';
import { HeroImagePanel } from '@/components/hero-image-panel';
import { DeleteGroupPanel } from './delete-group-panel';

export const dynamic = 'force-dynamic';

export default async function EditGroupPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/groups/${params.id}/edit`);

  const groupQueries = new SupabaseGroupQueryRepository(supabase);
  const group = await groupQueries.findDetailBySlug(params.id);
  if (!group) notFound();

  const role = await groupQueries.findViewerRole(group.id, user.id);
  if (role !== 'owner' && role !== 'admin') {
    redirect(`/groups/${group.slug}`);
  }

  return (
    <section className="mx-auto max-w-xl space-y-6 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Edit {group.name}</h1>
      </header>
      <EditGroupForm group={group} />
      <HeroImagePanel
        entityType="groups"
        entityId={group.id}
        userId={user.id}
        currentUrl={group.heroImageUrl}
        returnPath={`/groups/${group.slug}`}
      />
      {role === 'owner' && <DeleteGroupPanel groupId={group.id} groupName={group.name} />}
    </section>
  );
}
