'use client';

/**
 * Section 1 of the create-event form (architecture audit P3-1): the event-type
 * chooser + the off-platform-registration toggle. Flipping either reshapes the
 * rest of the form, so both pieces of state are owned by the parent and passed
 * in.
 */
import { EventType } from '@pickupvb/domain';
import { cardClass, cardSubClass, cardTitleClass, TypeCard } from './form-primitives';

export default function EventTypeSection({
  type,
  setType,
  isExternal,
  setIsExternal,
}: {
  type: EventType;
  setType: (v: EventType) => void;
  isExternal: boolean;
  setIsExternal: (v: boolean) => void;
}) {
  return (
    <section className={cardClass}>
      <div>
        <h2 className={cardTitleClass}>What are you hosting?</h2>
        <p className={cardSubClass}>Pick how players will sign up.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TypeCard
          value={EventType.OpenPlay}
          current={type}
          title="Open play / pickup"
          description="Drop-in, individual signups, optional position roster."
          onChange={setType}
        />
        <TypeCard
          value={EventType.Tournament}
          current={type}
          title="Tournament"
          description="Bracketed competition, team signups, one or more divisions."
          onChange={setType}
        />
      </div>
      <label className="border-border-base bg-highlight/20 flex items-start gap-2 rounded-md border p-3 text-sm">
        <input
          type="checkbox"
          name="isExternal"
          checked={isExternal}
          onChange={(e) => setIsExternal(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="text-fg font-medium">Registration happens off-platform</span>
          <span className="text-muted block text-xs">
            For events run via AES, VolleyballLife, Eventbrite, etc. PickupVB will list the event
            and link to your registration page — no signups or payments collected here.
          </span>
        </span>
      </label>
    </section>
  );
}
