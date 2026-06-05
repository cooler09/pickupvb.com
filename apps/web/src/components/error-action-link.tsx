import Link from 'next/link';
import type { Route } from 'next';

/**
 * One-click "fix this" link rendered after an error message so the viewer
 * can resolve the blocker without hunting for the right page — e.g. a host
 * who can't charge for an event yet gets "Finish Stripe setup →" pointing at
 * /profile/billing. Renders nothing when no action is provided, so call
 * sites can pass an optional `state.errorAction` unconditionally.
 */
export function ErrorActionLink({
  action,
}: {
  action?: { href: string; label: string } | undefined;
}) {
  if (!action) return null;
  return (
    <>
      {' '}
      <Link href={action.href as Route} className="font-medium underline underline-offset-2">
        {action.label}
      </Link>
    </>
  );
}
