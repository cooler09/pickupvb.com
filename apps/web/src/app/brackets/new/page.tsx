import Link from 'next/link';
import { requireRealUser } from '@/lib/server-auth';
import { FormatPickerForm } from '@/app/events/[id]/bracket/_components/format-picker-form';
import { NOTICE_LABEL } from '@/app/events/[id]/bracket/_components/labels';
import { primaryButtonClass } from '@/components/primary-button';
import { validateActiveBracketCap } from '@/lib/standalone-bracket-cap';
import { createStandaloneBracketFromForm } from '../actions';

export const dynamic = 'force-dynamic';

function pickQuery(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Create a standalone bracket (ADR 0025). Reuses the event format picker with
 * the standalone create action and min-team gating relaxed — teams are added
 * after the bracket exists (typed-in names, walk-in style).
 */
export default async function NewStandaloneBracketPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireRealUser('/brackets/new');
  const searchParams = await props.searchParams;
  const noticeCode = pickQuery(searchParams, 'notice');
  const noticeMsg = pickQuery(searchParams, 'msg');
  const notice = noticeCode ? (NOTICE_LABEL[noticeCode] ?? null) : null;

  // Free hosts run one active bracket at a time (ADR 0025 addendum / R-3). When
  // already at the cap, show the upgrade path instead of a format picker that
  // would only bounce on submit.
  const cap = await validateActiveBracketCap(user.id);

  return (
    <article className="mx-auto max-w-3xl space-y-6 p-4">
      <Link href="/brackets" className="text-primary text-sm hover:underline">
        {'← My brackets'}
      </Link>

      <header className="space-y-1">
        <h1 className="text-fg text-headline-sm font-bold">New bracket</h1>
        <p className="text-muted text-sm">
          Pick a format. After creating it you{'’'}ll add your teams by name, seed them, then
          generate the bracket.
        </p>
      </header>

      {notice && notice.tone === 'error' && (
        <div
          role="alert"
          className="text-md-error rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm"
        >
          {notice.text}
          {noticeMsg && <span className="ml-1 opacity-80">— {noticeMsg}</span>}
        </div>
      )}

      {cap.ok ? (
        <FormatPickerForm
          action={createStandaloneBracketFromForm}
          enforceMinTeams={false}
          teamCount={0}
        />
      ) : (
        <div className="border-primary/30 bg-primary/5 rounded-shape-sm space-y-3 border p-5">
          <h2 className="text-fg text-base font-semibold">You{'’'}re running a bracket already</h2>
          <p className="text-muted text-sm">{cap.reason}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/profile/billing/pro" className={primaryButtonClass('md')}>
              Upgrade to Pro
            </Link>
            <Link
              href="/brackets"
              className="border-border-base bg-md-surface-container hover:bg-fg/5 rounded-md border px-4 py-2 text-sm font-medium"
            >
              My brackets
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}
