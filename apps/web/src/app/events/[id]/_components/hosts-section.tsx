import Image from 'next/image';
import Link from 'next/link';
import type { EventDetailReadModel } from '@pickupvb/domain';
import { UserPicker } from '@/components/user-picker';
import { SocialLinks } from '@/components/social-links';
import type { SocialHandles } from '@/lib/social-handles';
import { addCoHostFromForm, removeEventCoHost } from '../co-host-actions';

type ProfileLite = {
  id: string;
  handle: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
};

function profileName(p: ProfileLite): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return full || p.displayName || 'Player';
}

type Props = {
  eventId: string;
  primaryHostUser: EventDetailReadModel['primaryHostUser'];
  primaryHostGroup: EventDetailReadModel['primaryHostGroup'];
  coHostUsers: EventDetailReadModel['coHostUsers'];
  coHostGroups: EventDetailReadModel['coHostGroups'];
  canManage: boolean;
  viewerHostableGroups: EventDetailReadModel['viewerHostableGroups'];
  returnPath: string;
  /** Optional social handles for the primary host user (rendered inline). */
  primaryHostUserSocial?: SocialHandles;
};

/**
 * "Hosted by" section: primary host (group + manager user), co-hosts (groups
 * and users) with inline remove buttons for managers, and a collapsible
 * "Add co-host" form. All co-host mutations route through the
 * `addCoHostFromForm` / `removeEventCoHost` server actions.
 */
export function HostsSection({
  eventId,
  primaryHostUser,
  primaryHostGroup,
  coHostUsers,
  coHostGroups,
  canManage,
  viewerHostableGroups,
  returnPath,
  primaryHostUserSocial,
}: Props) {
  return (
    <section className="border-border-base space-y-2 rounded-lg border p-4">
      <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">Hosted by</h2>
      <ul className="flex flex-wrap gap-2">
        {primaryHostGroup && (
          <li>
            <Link
              href={`/groups/${primaryHostGroup.slug}`}
              className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium"
            >
              {primaryHostGroup.avatarUrl ? (
                <Image
                  src={primaryHostGroup.avatarUrl}
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded object-cover"
                />
              ) : (
                <span aria-hidden="true" className="text-xs">
                  🏐
                </span>
              )}
              {primaryHostGroup.name}
            </Link>
          </li>
        )}
        {primaryHostUser && (
          <li>
            <Link
              href={`/players/${primaryHostUser.handle}`}
              className="border-border-base hover:bg-fg/5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            >
              {profileName(primaryHostUser)}
              {primaryHostGroup && <span className="text-muted text-xs">(manager)</span>}
            </Link>
          </li>
        )}
        {primaryHostUser && primaryHostUserSocial && (
          <li>
            <SocialLinks handles={primaryHostUserSocial} />
          </li>
        )}
        {coHostGroups.map((g) => (
          <li key={`g-${g.id}`}>
            <Link
              href={`/groups/${g.slug}`}
              className="border-border-base hover:bg-fg/5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            >
              {g.name}
              <span className="text-muted text-xs">(co-host)</span>
            </Link>
            {canManage && (
              <form
                action={removeEventCoHost.bind(null, eventId, { groupId: g.id }, returnPath)}
                className="ml-1 inline"
              >
                <button
                  type="submit"
                  title="Remove co-host"
                  aria-label={`Remove co-host ${g.name}`}
                  className="text-muted text-xs hover:text-red-600"
                >
                  <span aria-hidden>✕</span>
                </button>
              </form>
            )}
          </li>
        ))}
        {coHostUsers.map((p) => (
          <li key={`u-${p.id}`}>
            <Link
              href={`/players/${p.handle}`}
              className="border-border-base hover:bg-fg/5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            >
              {profileName(p)}
              <span className="text-muted text-xs">(co-host)</span>
            </Link>
            {canManage && (
              <form
                action={removeEventCoHost.bind(null, eventId, { userId: p.id }, returnPath)}
                className="ml-1 inline"
              >
                <button
                  type="submit"
                  title="Remove co-host"
                  aria-label={`Remove co-host ${profileName(p)}`}
                  className="text-muted text-xs hover:text-red-600"
                >
                  <span aria-hidden>✕</span>
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <details className="mt-2">
          <summary className="text-primary cursor-pointer text-xs font-medium hover:underline">
            + Add co-host
          </summary>
          <div className="mt-3 space-y-3">
            {viewerHostableGroups.length > 0 && (
              <form
                action={addCoHostFromForm.bind(null, eventId, returnPath)}
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="kind" value="group" />
                <label className="text-muted text-xs">
                  Group
                  <select
                    name="group_id"
                    defaultValue=""
                    className="border-border-base bg-surface mt-1 block rounded-md border px-2 py-1 text-sm"
                  >
                    <option value="">Pick a group…</option>
                    {viewerHostableGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1 text-sm"
                >
                  Add group
                </button>
              </form>
            )}
            <form action={addCoHostFromForm.bind(null, eventId, returnPath)} className="space-y-2">
              <input type="hidden" name="kind" value="user" />
              <UserPicker
                name="user_id"
                label="Add a player as co-host"
                placeholder="Search by name…"
                helperText="Type at least 2 letters to search."
                excludeIds={[
                  ...(primaryHostUser ? [primaryHostUser.id] : []),
                  ...coHostUsers.map((p) => p.id),
                ]}
              />
              <button
                type="submit"
                className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1 text-sm"
              >
                Add user
              </button>
            </form>
          </div>
        </details>
      )}
    </section>
  );
}
