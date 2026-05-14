import { UserPicker } from '@/components/user-picker';
import { addFriendFromForm } from '../actions';

type Props = {
    returnPath: string;
    /** Viewer + already-followed ids \u2014 hidden from search results. */
    excludeIds: ReadonlyArray<string>;
};

export function AddFriendForm({ returnPath, excludeIds }: Props) {
    return (
        <section className="rounded-lg border border-border-base p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                Follow a player
            </h2>
            <form action={addFriendFromForm.bind(null, returnPath)} className="space-y-3">
                <UserPicker
                    name="friend_id"
                    label="Find a player"
                    placeholder="Search by name…"
                    required
                    helperText="Type at least 2 characters to search."
                    excludeIds={excludeIds}
                />
                <div className="flex justify-end">
                    <button
                        type="submit"
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                    >
                        Follow
                    </button>
                </div>
            </form>
        </section>
    );
}
