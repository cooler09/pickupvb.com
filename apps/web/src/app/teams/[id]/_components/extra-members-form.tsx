import { SubmitButton } from '@/components/submit-button';
import { setExtraMembersFromForm } from '../../actions';

type Props = {
  teamId: string;
  returnPath: string;
  /** Current off-site player count. */
  value: number;
};

/**
 * Captain-only control to record how many additional players are on the team
 * but don't have site accounts. Counts toward the roster cap so the team
 * can't over-register, but otherwise only used for display.
 */
export function ExtraMembersForm({ teamId, returnPath, value }: Props) {
  return (
    <section className="border-border-base rounded-shape-sm border p-4">
      <h2 className="text-muted mb-1 text-sm font-semibold tracking-wide uppercase">
        Off-site players
      </h2>
      <p className="text-fg/60 mb-3 text-xs">
        Optional — count of teammates who aren&apos;t on PickupVB. They count toward your roster
        cap.
      </p>
      <form
        action={setExtraMembersFromForm.bind(null, teamId, returnPath)}
        className="flex items-end gap-2"
      >
        <label className="block">
          <span className="sr-only">Off-site player count</span>
          <input
            name="extra_member_count"
            type="number"
            min={0}
            max={20}
            defaultValue={value}
            className="border-border-base bg-surface w-24 rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
          Save
        </SubmitButton>
      </form>
    </section>
  );
}
