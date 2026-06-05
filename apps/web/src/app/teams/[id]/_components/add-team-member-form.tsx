import { UserPicker } from '@/components/user-picker';
import { addMemberFromForm } from '../../actions';

type Props = {
  teamId: string;
  returnPath: string;
  /** Members already on the roster — hidden from search results. */
  existingMemberIds: ReadonlyArray<string>;
};

/**
 * Captain-only "Add a teammate" form. Uses the UserPicker typeahead so the
 * captain can search by name instead of needing a UUID. The handler enforces
 * the captain check + roster cap.
 *
 * Picking a player adds them immediately (`submitOnSelect`) — no separate
 * confirm button. The `key` on the roster remounts the picker once the add
 * settles, clearing the search so the captain can add the next teammate.
 */
export function AddTeamMemberForm({ teamId, returnPath, existingMemberIds }: Props) {
  return (
    <section className="border-border-base rounded-shape-sm border p-4">
      <h2 className="text-muted mb-3 text-sm font-semibold tracking-wide uppercase">
        Add a teammate
      </h2>
      <form action={addMemberFromForm.bind(null, teamId, returnPath)}>
        <UserPicker
          key={existingMemberIds.join(',')}
          name="user_id"
          label="Find a player"
          placeholder="Search by name…"
          required
          helperText="Type at least 2 characters to search, then pick a name to add them."
          excludeIds={existingMemberIds}
          submitOnSelect
        />
      </form>
    </section>
  );
}
