import { UserPicker } from '@/components/user-picker';
import { SubmitButton } from '@/components/submit-button';
import { addMemberFromForm } from '../members-actions';

type Props = {
  groupId: string;
  /** Whether the viewer can grant the "owner" role. */
  canPromoteToOwner: boolean;
  returnPath: string;
  /** Current members — hidden from search results. */
  existingMemberIds: ReadonlyArray<string>;
};

/**
 * "Add a member" control with the UserPicker typeahead. Owner role appears
 * only when the acting user is themselves an owner.
 */
export function AddMemberForm({
  groupId,
  canPromoteToOwner,
  returnPath,
  existingMemberIds,
}: Props) {
  return (
    <section className="border-border-base rounded-lg border p-4">
      <h2 className="text-muted mb-3 text-sm font-semibold tracking-wide uppercase">
        Add a member
      </h2>
      <form action={addMemberFromForm.bind(null, groupId, returnPath)} className="space-y-3">
        <UserPicker
          name="user_id"
          label="Find a player"
          placeholder="Search by name…"
          required
          helperText="Type at least 2 characters to search."
          excludeIds={existingMemberIds}
        />
        <div>
          <label htmlFor="role" className="text-fg block text-sm font-medium">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue="member"
            className="border-border-base bg-surface mt-1 block w-full rounded-md border px-3 py-2 text-sm sm:w-48"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            {canPromoteToOwner && <option value="owner">Owner</option>}
          </select>
        </div>
        <div className="flex justify-end">
          <SubmitButton
            className="bg-primary hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            pendingChildren="Adding…"
          >
            Add member
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
