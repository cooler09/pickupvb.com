import { BRACKET_FORMATS } from '@pickupvb/domain';
import { createBracketFromForm } from '../actions';
import { FORMAT_LABEL } from './labels';

export function NoBracketView(props: {
  eventId: string;
  divisionId: string;
  teamCount: number;
  isHost: boolean;
}) {
  if (!props.isHost) {
    return (
      <p className="text-muted text-sm">
        The host hasn{'’'}t created a bracket for this tournament yet.
      </p>
    );
  }
  return (
    <section className="border-border-base bg-fg/5 space-y-3 rounded-lg border p-4">
      <h2 className="text-fg text-lg font-semibold">Create bracket</h2>
      <p className="text-muted text-sm">
        Pick a format. You can change it (by resetting) before any matches are played.
      </p>
      <form
        action={createBracketFromForm.bind(null, props.eventId, props.divisionId)}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-sm">
          <span className="text-fg/80">Format</span>
          <select
            name="format"
            className="border-border-base bg-bg rounded border px-2 py-1"
            defaultValue="single_elimination"
          >
            {BRACKET_FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          <span className="text-fg/80">Pools (pool play only)</span>
          <select
            name="pool_count"
            className="border-border-base bg-bg rounded border px-2 py-1"
            defaultValue="2"
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          <span className="text-fg/80">Advance per pool</span>
          <select
            name="advance_per_pool"
            className="border-border-base bg-bg rounded border px-2 py-1"
            defaultValue="2"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={props.teamCount < 2}
          className="bg-primary text-primary-fg rounded px-3 py-1 text-sm disabled:opacity-50"
        >
          Create
        </button>
        {props.teamCount < 2 && (
          <span className="text-muted text-xs">
            Need at least 2 registered teams to create a bracket.
          </span>
        )}
      </form>
    </section>
  );
}
