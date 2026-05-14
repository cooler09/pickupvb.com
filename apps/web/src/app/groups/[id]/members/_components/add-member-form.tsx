import { addMemberFromForm } from '../members-actions';

type Props = {
    groupId: string;
    /** Whether the viewer can grant the "owner" role. */
    canPromoteToOwner: boolean;
    returnPath: string;
};

/**
 * Plain-form "Add a member" control. Accepts a UUID + role and delegates to
 * the bound `addMemberFromForm` server action. Owner role appears only when
 * the acting user is themselves an owner.
 */
export function AddMemberForm({ groupId, canPromoteToOwner, returnPath }: Props) {
    return (
        <section className="rounded-lg border border-border-base p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                Add a member
            </h2>
            <form action={addMemberFromForm.bind(null, groupId, returnPath)} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                        name="user_id"
                        placeholder="User ID (UUID)"
                        required
                        className="sm:col-span-2 rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                    />
                    <select
                        name="role"
                        defaultValue="member"
                        className="rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
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
                <p className="text-xs text-muted">
                    Tip: get a user&apos;s UUID from their profile URL —{' '}
                    <code className="rounded bg-fg/5 px-1">/players/[id]</code>.
                </p>
            </form>
        </section>
    );
}
