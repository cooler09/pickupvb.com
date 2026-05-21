import { UserPicker } from '@/components/user-picker';
import { SubmitButton } from '@/components/submit-button';
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
 */
export function AddTeamMemberForm({ teamId, returnPath, existingMemberIds }: Props) {
  return (
    <section className="border-border-base rounded-lg border p-4">
      <h2 className="text-muted mb-3 text-sm font-semibold tracking-wide uppercase">
        Add a teammate
      </h2>
      <form action={addMemberFromForm.bind(null, teamId, returnPath)} className="space-y-3">
        <UserPicker
          name="user_id"
          label="Find a player"
          placeholder="Search by name…"
          required
          helperText="Type at least 2 characters to search."
          excludeIds={existingMemberIds}
        />
        <div className="flex justify-end">
          <SubmitButton className="bg-primary hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            Add teammate
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
