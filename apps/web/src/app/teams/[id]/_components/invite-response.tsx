import { SubmitButton } from '@/components/submit-button';
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
    <section className="border-primary/40 bg-primary/5 rounded-shape-sm border p-4">
      <h2 className="text-primary mb-1 text-sm font-semibold tracking-wide uppercase">
        You&apos;ve been invited
      </h2>
      <p className="mb-3 text-sm">
        The captain invited you to join <strong>{teamName}</strong>. Accept to appear on the roster.
      </p>
      <div className="flex flex-wrap gap-2">
        <form action={acceptInviteAction.bind(null, teamId, returnPath)}>
          <SubmitButton className="bg-primary hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            Accept invite
          </SubmitButton>
        </form>
        <form action={declineInviteAction.bind(null, teamId, returnPath)}>
          <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">
            Decline
          </SubmitButton>
        </form>
      </div>
    </section>
  );
}
