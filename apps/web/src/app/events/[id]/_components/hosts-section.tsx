import Link from 'next/link';
import type { EventDetailReadModel } from '@pickupvb/domain';
import { UserPicker } from '@/components/user-picker';
import {
    addCoHostFromForm,
    removeEventCoHost,
} from '../co-host-actions';

type ProfileLite = {
    id: string;
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
}: Props) {
    return (
        <section className="space-y-2 rounded-lg border border-border-base p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Hosted by
            </h2>
            <ul className="flex flex-wrap gap-2">
                {primaryHostGroup && (
                    <li>
                        <Link
                            href={`/groups/${primaryHostGroup.id}`}
                            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary hover:bg-primary/20"
                        >
                            {primaryHostGroup.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={primaryHostGroup.avatarUrl}
                                    alt=""
                                    className="h-5 w-5 rounded object-cover"
                                />
                            ) : (
                                <span aria-hidden="true" className="text-xs">🏐</span>
                            )}
                            {primaryHostGroup.name}
                        </Link>
                    </li>
                )}
                {primaryHostUser && (
                    <li>
                        <Link
                            href={`/players/${primaryHostUser.id}`}
                            className="inline-flex items-center gap-2 rounded-full border border-border-base px-3 py-1 text-sm hover:bg-fg/5"
                        >
                            {profileName(primaryHostUser)}
                            {primaryHostGroup && (
                                <span className="text-xs text-muted">(manager)</span>
                            )}
                        </Link>
                    </li>
                )}
                {coHostGroups.map((g) => (
                    <li key={`g-${g.id}`}>
                        <Link
                            href={`/groups/${g.id}`}
                            className="inline-flex items-center gap-2 rounded-full border border-border-base px-3 py-1 text-sm hover:bg-fg/5"
                        >
                            {g.name}
                            <span className="text-xs text-muted">(co-host)</span>
                        </Link>
                        {canManage && (
                            <form
                                action={removeEventCoHost.bind(null, eventId, { groupId: g.id }, returnPath)}
                                className="ml-1 inline"
                            >
                                <button
                                    type="submit"
                                    title="Remove co-host"
                                    className="text-xs text-muted hover:text-red-600"
                                >
                                    ✕
                                </button>
                            </form>
                        )}
                    </li>
                ))}
                {coHostUsers.map((p) => (
                    <li key={`u-${p.id}`}>
                        <Link
                            href={`/players/${p.id}`}
                            className="inline-flex items-center gap-2 rounded-full border border-border-base px-3 py-1 text-sm hover:bg-fg/5"
                        >
                            {profileName(p)}
                            <span className="text-xs text-muted">(co-host)</span>
                        </Link>
                        {canManage && (
                            <form
                                action={removeEventCoHost.bind(null, eventId, { userId: p.id }, returnPath)}
                                className="ml-1 inline"
                            >
                                <button
                                    type="submit"
                                    title="Remove co-host"
                                    className="text-xs text-muted hover:text-red-600"
                                >
                                    ✕
                                </button>
                            </form>
                        )}
                    </li>
                ))}
            </ul>

            {canManage && (
                <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">
                        + Add co-host
                    </summary>
                    <div className="mt-3 space-y-3">
                        {viewerHostableGroups.length > 0 && (
                            <form
                                action={addCoHostFromForm.bind(null, eventId, returnPath)}
                                className="flex flex-wrap items-end gap-2"
                            >
                                <input type="hidden" name="kind" value="group" />
                                <label className="text-xs text-muted">
                                    Group
                                    <select
                                        name="group_id"
                                        defaultValue=""
                                        className="mt-1 block rounded-md border border-border-base bg-surface px-2 py-1 text-sm"
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
                                    className="rounded-md border border-border-base px-3 py-1 text-sm hover:bg-fg/5"
                                >
                                    Add group
                                </button>
                            </form>
                        )}
                        <form
                            action={addCoHostFromForm.bind(null, eventId, returnPath)}
                            className="space-y-2"
                        >
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
                                className="rounded-md border border-border-base px-3 py-1 text-sm hover:bg-fg/5"
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
