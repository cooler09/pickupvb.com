import { redirect } from 'next/navigation';
import { SupabaseGroupQueryRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import { isAnonymousUser } from '@/lib/server-auth';
import { getHostStripeAccount } from '@/lib/host-stripe-account';
import { hasProBenefits } from '@/lib/admin';
import { hostPaidEventCount30d, FREE_PAID_EVENT_CAP_30D } from '@/lib/pro';
import NewEventForm from './new-event-form';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Create event — PickupVB',
  robots: { index: false, follow: false },
};

function pickQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = searchParams?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function NewEventPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/events/new');
  }
  // Hosting needs a claimed account (+ Stripe payout) to be useful, so route an
  // anonymous user to finish their account first instead of showing the full
  // create-event form they can't submit (persona-ux V-4). Mirrors the gate on
  // `/teams/new`; the submit action also rejects anon as a backstop.
  if (isAnonymousUser(user)) {
    redirect('/claim?next=/events/new');
  }

  // Groups the user can host as (must be owner/admin).
  const manageableGroups = await new SupabaseGroupQueryRepository(supabase).listManageableGroups(
    user.id,
  );
  const hostableGroups = manageableGroups.map((g) => ({ id: g.id, name: g.name }));

  // Stripe payout readiness drives whether on-platform payment controls
  // are rendered at all. `getHostStripeAccount` returns the connected
  // account id only when `charges_enabled` is true.
  const stripeAccountId = await getHostStripeAccount(user.id);
  const canCollectPayments = stripeAccountId !== null;

  const viewerHasProBenefits = await hasProBenefits(user.id);

  // Proactive upgrade nudge (monetization O-4): a free host who has already used
  // their rolling-30d paid-event allowance sees the wall *before* filling out a
  // paid event, not just on submit. Free events are always unlimited, so this is
  // only about the paid path. Skip the count query for Pro hosts.
  const atPaidEventCap =
    !viewerHasProBenefits && (await hostPaidEventCount30d(user.id)) >= FREE_PAID_EVENT_CAP_30D;

  const { data: templateRows } = await supabase
    .from('host_event_templates')
    .select('id, name, payload')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(25);

  type TemplateRow = {
    id: string;
    name: string;
    payload: Record<string, string> | null;
  };
  const templates = ((templateRows as TemplateRow[] | null) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
  }));

  const selectedTemplateId = pickQuery(searchParams, 'template');
  const selectedTemplate = ((templateRows as TemplateRow[] | null) ?? []).find(
    (r) => r.id === selectedTemplateId,
  );
  const templateValues = selectedTemplate?.payload ?? undefined;
  const templateStatus = pickQuery(searchParams, 'template_status');

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-headline-lg font-bold">Host an event</h1>
        <p className="text-muted text-sm">
          Set up your pickup session, tournament, or league. You can edit any of this later.
        </p>
      </header>
      <NewEventForm
        // Remount when the applied template changes so `useFormState`
        // re-seeds its initialState from the new `templateValues`. React's
        // `useFormState` only reads initialState on first mount, and Next.js
        // App Router preserves client components across same-route soft
        // navigations — without this key, applying a template via the GET
        // submit (?template=<id>) leaves the form fields blank.
        key={selectedTemplateId ?? 'no-template'}
        hostableGroups={hostableGroups}
        canCollectPayments={canCollectPayments}
        templates={templates}
        viewerHasProBenefits={viewerHasProBenefits}
        atPaidEventCap={atPaidEventCap}
        {...(templateStatus ? { templateStatus } : {})}
        {...(selectedTemplateId ? { selectedTemplateId } : {})}
        {...(templateValues ? { templateValues } : {})}
      />
    </section>
  );
}
