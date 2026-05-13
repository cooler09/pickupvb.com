type AttendeeProfile = {
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
};

type Attendee = {
    user_id: string;
    joined_at: string;
    profiles: AttendeeProfile | null;
};

function initialsOf(p: AttendeeProfile | null): string {
    if (!p) return '?';
    const f = p.first_name?.trim()?.[0];
    const l = p.last_name?.trim()?.[0];
    if (f && l) return (f + l).toUpperCase();
    const parts = (p.display_name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return (p.display_name ?? '?').slice(0, 2).toUpperCase();
}

function nameOf(p: AttendeeProfile | null): string {
    if (!p) return 'Player';
    const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    return full || p.display_name || 'Player';
}

export function AttendeeList({
    attendees,
    currentUserId,
}: {
    attendees: Attendee[];
    currentUserId: string | null;
}) {
    if (attendees.length === 0) {
        return (
            <p className="rounded-lg border border-dashed border-border-base p-4 text-sm text-muted">
                No one&apos;s signed up yet — be the first!
            </p>
        );
    }

    return (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {attendees.map((a) => {
                const name = nameOf(a.profiles);
                const isYou = a.user_id === currentUserId;
                return (
                    <li
                        key={a.user_id}
                        className="flex items-center gap-3 rounded-lg border border-border-base px-3 py-2"
                    >
                        {a.profiles?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={a.profiles.avatar_url}
                                alt=""
                                className="h-9 w-9 rounded-full object-cover"
                            />
                        ) : (
                            <span
                                aria-hidden="true"
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                            >
                                {initialsOf(a.profiles)}
                            </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                            {name}
                            {isYou && (
                                <span className="ml-1 text-xs font-normal text-muted">(you)</span>
                            )}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
