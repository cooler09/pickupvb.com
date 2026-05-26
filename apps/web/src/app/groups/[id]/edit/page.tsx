import { notFound, redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import EditGroupForm from './edit-group-form';
import { HeroImagePanel } from '@/components/hero-image-panel';
import { DeleteGroupPanel } from './delete-group-panel';

export const dynamic = 'force-dynamic';

type GroupRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatar_url: string | null;
  hero_image_url: string | null;
  home_city: string | null;
  region: string | null;
};

export default async function EditGroupPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/groups/${params.id}/edit`);

  const { data: groupData } = await supabase
    .from('groups')
    .select('id, slug, name, description, avatar_url, hero_image_url, home_city, region')
    .eq('slug', params.id)
    .maybeSingle();
  const group = groupData as GroupRow | null;
  if (!group) notFound();

  const { data: roleRow } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .maybeSingle();
  const role = (roleRow as { role: string } | null)?.role;
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
        currentUrl={group.hero_image_url}
        returnPath={`/groups/${group.slug}`}
      />
      {role === 'owner' && <DeleteGroupPanel groupId={group.id} groupName={group.name} />}
    </section>
  );
}
