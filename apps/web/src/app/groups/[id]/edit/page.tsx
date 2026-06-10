import EditGroupForm from './edit-group-form';
import { GroupAvatarPanel } from '@/components/group-avatar-panel';
import { DeleteGroupPanel } from './delete-group-panel';
import { requireGroupManager } from '../_lib/require-group-manager';

export const dynamic = 'force-dynamic';

export default async function EditGroupPage(props: { params: Promise<{ id: string }> }) {
  const { id: slug } = await props.params;
  const { group, role, userId } = await requireGroupManager(slug, `/groups/${slug}/edit`);

  return (
    <section className="mx-auto max-w-xl space-y-6 py-4">
      <header className="space-y-1">
        <h1 className="text-headline-sm font-bold">Edit {group.name}</h1>
      </header>
      <EditGroupForm group={group} />
      <GroupAvatarPanel
        groupId={group.id}
        userId={userId}
        currentUrl={group.avatarUrl}
        initials={group.name.slice(0, 2).toUpperCase()}
        returnPath={`/groups/${group.slug}`}
      />
      {role === 'owner' && <DeleteGroupPanel groupId={group.id} groupName={group.name} />}
    </section>
  );
}
