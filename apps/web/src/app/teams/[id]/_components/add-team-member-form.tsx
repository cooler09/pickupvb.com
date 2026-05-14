import { addMemberFromForm } from '../../actions';

type Props = {
    teamId: string;
    returnPath: string;
};

/**
 * Captain-only "Add a teammate" form. Accepts a user UUID and delegates to
 * the bound `addMemberFromForm` server action. The handler enforces the
 * captain check + roster cap.
 */
export function AddTeamMemberForm({ teamId, returnPath }: Props) {
    return (
        <section className="rounded-lg border border-border-base p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                Add a teammate
            </h2>
            <form action={addMemberFromForm.bind(null, teamId, returnPath)} className="space-y-3">
                <input
                    name="user_id"
                    placeholder="User ID (UUID)"
                    required
                    className="w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm"
                />
                <div className="flex justify-end">
                    <button
                        type="submit"
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                    >
                        Add teammate
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
