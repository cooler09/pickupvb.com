import { NextResponse } from 'next/server';
import { getPollHandlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { csvCell } from '@/lib/csv';

export const dynamic = 'force-dynamic';

/**
 * GET /api/polls/[id]/responses.csv
 *
 * Poll response export (ADR 0041, Phase 3). One row per respondent: name,
 * submitted-at, then a column per question with the chosen option label(s).
 * Authorized to the poll's creator only — `getHostPollResults` runs on the
 * user-scoped client, so creator-only RLS returns null for anyone else (→ 404).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { getHostPollResults } = await getPollHandlers();
  const poll = await getHostPollResults.execute(id, user.id);
  if (!poll) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // optionId → { questionId, label } so a flat response.optionIds can be grouped
  // back under its question column.
  const optionMap = new Map<string, { questionId: string; label: string }>();
  for (const q of poll.questions) {
    for (const o of q.options) optionMap.set(o.id, { questionId: q.id, label: o.label });
  }

  const header = ['name', 'submitted_at', ...poll.questions.map((q) => q.prompt)];
  const lines = [
    header.map((h) => csvCell(h)).join(','),
    ...poll.responses.map((r) => {
      const byQuestion = new Map<string, string[]>();
      for (const oid of r.optionIds) {
        const m = optionMap.get(oid);
        if (!m) continue;
        const list = byQuestion.get(m.questionId) ?? [];
        list.push(m.label);
        byQuestion.set(m.questionId, list);
      }
      return [
        csvCell(r.respondentName),
        csvCell(r.createdAt),
        ...poll.questions.map((q) => csvCell((byQuestion.get(q.id) ?? []).join('; '))),
      ].join(',');
    }),
  ];

  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="poll-${id}-responses.csv"`,
    },
  });
}
