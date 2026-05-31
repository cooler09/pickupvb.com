import Link from 'next/link';
import { requireRealUser } from '@/lib/server-auth';
import { FormatPickerForm } from '@/app/events/[id]/bracket/_components/format-picker-form';
import { NOTICE_LABEL } from '@/app/events/[id]/bracket/_components/labels';
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
  await requireRealUser('/brackets/new');
  const searchParams = await props.searchParams;
  const noticeCode = pickQuery(searchParams, 'notice');
  const noticeMsg = pickQuery(searchParams, 'msg');
  const notice = noticeCode ? (NOTICE_LABEL[noticeCode] ?? null) : null;

  return (
    <article className="mx-auto max-w-3xl space-y-6 p-4">
      <Link href="/brackets" className="text-primary text-sm hover:underline">
        {'← My brackets'}
      </Link>

      <header className="space-y-1">
        <h1 className="text-fg text-2xl font-bold">New bracket</h1>
        <p className="text-muted text-sm">
          Pick a format. After creating it you{'’'}ll add your teams by name, seed them, then
          generate the bracket.
        </p>
      </header>

      {notice && notice.tone === 'error' && (
        <div
          role="alert"
          className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
        >
          {notice.text}
          {noticeMsg && <span className="ml-1 opacity-80">— {noticeMsg}</span>}
        </div>
      )}

      <FormatPickerForm
        action={createStandaloneBracketFromForm}
        enforceMinTeams={false}
        teamCount={0}
      />
    </article>
  );
}
