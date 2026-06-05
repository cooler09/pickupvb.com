'use client';

import { useState } from 'react';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';
import { primaryButtonClass } from '@/components/primary-button';
import { EventBadgeIconUpload } from './event-badge-icon-upload';
import { addEventBadgeFromForm } from './badge-actions';

/**
 * Add-a-badge form for the host panel. Client component because it mints the new
 * badge's id up front (so the icon upload path and the inserted row id line up)
 * and hosts the upload widget. The id rides in a hidden input the server action
 * reads. Server actions are serializable references, so binding the action with
 * the route args here is allowed across the boundary.
 */
export function AddEventBadgeForm({
  eventId,
  userId,
  returnPath,
}: {
  eventId: string;
  userId: string;
  returnPath: string;
}) {
  const [badgeId] = useState(() => crypto.randomUUID());
  const action = addEventBadgeFromForm.bind(null, eventId, returnPath);

  return (
    <form
      action={action}
      className="border-border-base space-y-4 rounded-md border border-dashed p-4"
    >
      <input type="hidden" name="id" value={badgeId} />

      <div>
        <label htmlFor="badge-label" className={labelClass}>
          Badge name
        </label>
        <input
          id="badge-label"
          name="label"
          required
          minLength={1}
          maxLength={40}
          placeholder="e.g. Summer Slam 2026"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="badge-description" className={labelClass}>
          Description (optional)
        </label>
        <input
          id="badge-description"
          name="description"
          maxLength={140}
          placeholder="What does earning this badge mean?"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="badge-rule" className={labelClass}>
          How players earn it
        </label>
        <select id="badge-rule" name="grant_rule" defaultValue="on_attend" className={inputClass}>
          <option value="on_attend">Automatically — everyone who attends</option>
          <option value="host_grant">Manually — I&apos;ll award it (coming soon)</option>
        </select>
      </div>

      <EventBadgeIconUpload eventId={eventId} userId={userId} badgeId={badgeId} />

      <button type="submit" className={primaryButtonClass('md')}>
        Add badge
      </button>
    </form>
  );
}
