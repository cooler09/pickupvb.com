import { acceptInviteAction, declineInviteAction } from '../../actions';

type Props = {
    teamId: string;
    teamName: string;
    returnPath: string;
};

/**
 * Banner shown to a player who has a pending invite to this team. Renders
 * Accept and Decline buttons that hit the corresponding server actions.
 */
export function InviteResponse({ teamId, teamName, returnPath }: Props) {
    return (
        <section className="rounded-lg border border-primary/40 bg-primary/5 p-4">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-primary">
                You&apos;ve been invited
            </h2>
            <p className="mb-3 text-sm">
                The captain invited you to join <strong>{teamName}</strong>. Accept to
                appear on the roster.
            </p>
            <div className="flex flex-wrap gap-2">
                <form action={acceptInviteAction.bind(null, teamId, returnPath)}>
                    <button
                        type="submit"
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                    >
                        Accept invite
                    </button>
                </form>
                <form action={declineInviteAction.bind(null, teamId, returnPath)}>
                    <button
                        type="submit"
                        className="rounded-md border border-border-base px-3 py-1.5 text-sm hover:bg-fg/5"
                    >
                        Decline
                    </button>
                </form>
            </div>
        </section>
    );
}
