import { UserPicker } from '@/components/user-picker';
import { primaryButtonClass } from '@/components/primary-button';
import { SubmitButton } from '@/components/submit-button';
import { addFriendFromForm } from '../actions';

type Props = {
  returnPath: string;
  /** Viewer + already-followed ids \u2014 hidden from search results. */
  excludeIds: ReadonlyArray<string>;
};

export function AddFriendForm({ returnPath, excludeIds }: Props) {
  return (
    <section className="border-border-base rounded-shape-sm border p-4">
      <h2 className="text-muted mb-3 text-sm font-semibold tracking-wide uppercase">
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
          <SubmitButton className={primaryButtonClass('sm')}>Follow</SubmitButton>
        </div>
      </form>
    </section>
  );
}
