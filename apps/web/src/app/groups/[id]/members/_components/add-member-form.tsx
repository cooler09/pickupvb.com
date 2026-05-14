import { UserPicker } from '@/components/user-picker';
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
        <section className="rounded-lg border border-border-base p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
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
                    <label htmlFor="role" className="block text-sm font-medium text-fg">
                        Role
                    </label>
                    <select
                        id="role"
                        name="role"
                        defaultValue="member"
                        className="mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm sm:w-48"
                    >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        {canPromoteToOwner && <option value="owner">Owner</option>}
                    </select>
                </div>
                <div className="flex justify-end">
                    <button
                        type="submit"
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                    >
                        Add member
                    </button>
                </div>
            </form>
        </section>
    );
}
