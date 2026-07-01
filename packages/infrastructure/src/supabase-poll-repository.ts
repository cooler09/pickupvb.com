import {
  Poll,
  PollOptionId,
  PollQuestionId,
  type HostPollResults,
  type PollQuestion,
  type PollQuestionKind,
  type PollRepository,
  type PollStatus,
  type PollSummary,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type PollRow = {
  id: string;
  creator_id: string;
  event_id: string | null;
  group_id: string | null;
  short_code: string | null;
  title: string;
  description: string;
  status: string;
  closes_at: string | null;
  show_respondent_names: boolean;
  created_at: string;
};

type QuestionRow = {
  id: string;
  poll_id: string;
  position: number;
  prompt: string;
  kind: string;
  required: boolean;
};

type OptionRow = { id: string; question_id: string; position: number; label: string };

/**
 * Supabase adapter for the `Poll` aggregate + its read models (ADR 0041).
 *
 * Like `SupabaseGroupRepository`, it **requires** a client: host writes/reads run
 * under the caller's session so the creator-only RLS (`creator_id = auth.uid()`,
 * `is_poll_creator(...)`) is the real gate. The public, sessionless responder
 * path does NOT use this adapter — it calls the `get_poll_config` /
 * `get_poll_results` / `submit_poll_response` RPCs on the anon client.
 */
export class SupabasePollRepository implements PollRepository {
  constructor(private readonly client: SupabaseClient) {}

  // ---- Write side -----------------------------------------------------------

  async findById(id: string): Promise<Poll | null> {
    const { data: pollData, error } = await this.client
      .from('polls')
      .select(
        'id, creator_id, event_id, group_id, short_code, title, description, status, closes_at, show_respondent_names, created_at',
      )
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Poll.findById failed: ${error.message}`);
    if (!pollData) return null;
    const poll = pollData as PollRow;

    const { data: questionData, error: qErr } = await this.client
      .from('poll_questions')
      .select('id, poll_id, position, prompt, kind, required')
      .eq('poll_id', id)
      .order('position');
    if (qErr) throw new Error(`Poll.findById questions failed: ${qErr.message}`);
    const questionRows = (questionData as QuestionRow[] | null) ?? [];

    const questionIds = questionRows.map((q) => q.id);
    let optionRows: OptionRow[] = [];
    if (questionIds.length > 0) {
      const { data: optionData, error: oErr } = await this.client
        .from('poll_options')
        .select('id, question_id, position, label')
        .in('question_id', questionIds)
        .order('position');
      if (oErr) throw new Error(`Poll.findById options failed: ${oErr.message}`);
      optionRows = (optionData as OptionRow[] | null) ?? [];
    }

    const questions: PollQuestion[] = questionRows.map((q) => ({
      id: PollQuestionId(q.id),
      prompt: q.prompt,
      kind: q.kind as PollQuestionKind,
      required: q.required,
      options: optionRows
        .filter((o) => o.question_id === q.id)
        .map((o) => ({ id: PollOptionId(o.id), label: o.label })),
    }));

    return Poll.fromPersistence({
      id: poll.id,
      creatorId: poll.creator_id,
      eventId: poll.event_id,
      groupId: poll.group_id,
      title: poll.title,
      description: poll.description,
      status: poll.status as PollStatus,
      closesAt: poll.closes_at ? new Date(poll.closes_at) : null,
      showRespondentNames: poll.show_respondent_names,
      questions,
      createdAt: new Date(poll.created_at),
    });
  }

  async add(poll: Poll): Promise<void> {
    const { error } = await this.client.from('polls').insert({
      id: poll.id,
      creator_id: poll.creatorId,
      event_id: poll.eventId,
      group_id: poll.groupId,
      title: poll.title,
      description: poll.description,
      status: poll.status,
      closes_at: poll.closesAt ? poll.closesAt.toISOString() : null,
      show_respondent_names: poll.showRespondentNames,
    });
    if (error) throw new Error(`Poll.add failed: ${error.message}`);
    await this.insertQuestions(poll);
  }

  async saveMetadata(poll: Poll): Promise<void> {
    const { error } = await this.client
      .from('polls')
      .update({
        title: poll.title,
        description: poll.description,
        status: poll.status,
        closes_at: poll.closesAt ? poll.closesAt.toISOString() : null,
        show_respondent_names: poll.showRespondentNames,
      })
      .eq('id', poll.id);
    if (error) throw new Error(`Poll.saveMetadata failed: ${error.message}`);
  }

  async replaceStructure(poll: Poll): Promise<void> {
    // Delete-then-reinsert. Only ever called when countResponses === 0 (the
    // aggregate enforces it), so the cascade to poll_answers touches nothing.
    const { error } = await this.client.from('poll_questions').delete().eq('poll_id', poll.id);
    if (error) throw new Error(`Poll.replaceStructure delete failed: ${error.message}`);
    await this.insertQuestions(poll);
  }

  private async insertQuestions(poll: Poll): Promise<void> {
    const questions = poll.questions;
    if (questions.length === 0) return;
    const { error: qErr } = await this.client.from('poll_questions').insert(
      questions.map((q, i) => ({
        id: q.id,
        poll_id: poll.id,
        position: i,
        prompt: q.prompt,
        kind: q.kind,
        required: q.required,
      })),
    );
    if (qErr) throw new Error(`Poll.insertQuestions failed: ${qErr.message}`);

    const optionRows = questions.flatMap((q) =>
      q.options.map((o, i) => ({
        id: o.id,
        question_id: q.id,
        position: i,
        label: o.label,
      })),
    );
    if (optionRows.length > 0) {
      const { error: oErr } = await this.client.from('poll_options').insert(optionRows);
      if (oErr) throw new Error(`Poll.insertQuestions options failed: ${oErr.message}`);
    }
  }

  async countResponses(pollId: string): Promise<number> {
    const { count, error } = await this.client
      .from('poll_responses')
      .select('id', { count: 'exact', head: true })
      .eq('poll_id', pollId);
    if (error) throw new Error(`Poll.countResponses failed: ${error.message}`);
    return count ?? 0;
  }

  async delete(pollId: string): Promise<void> {
    const { error } = await this.client.from('polls').delete().eq('id', pollId);
    if (error) throw new Error(`Poll.delete failed: ${error.message}`);
  }

  // ---- Read side ------------------------------------------------------------

  async getHostResults(pollId: string, _viewerId: string): Promise<HostPollResults | null> {
    const { data: pollData, error } = await this.client
      .from('polls')
      .select(
        'id, creator_id, event_id, group_id, short_code, title, description, status, closes_at, show_respondent_names, created_at',
      )
      .eq('id', pollId)
      .maybeSingle();
    if (error) throw new Error(`Poll.getHostResults failed: ${error.message}`);
    if (!pollData) return null;
    const poll = pollData as PollRow;

    const { data: questionData } = await this.client
      .from('poll_questions')
      .select('id, poll_id, position, prompt, kind, required')
      .eq('poll_id', pollId)
      .order('position');
    const questionRows = (questionData as QuestionRow[] | null) ?? [];
    const questionIds = questionRows.map((q) => q.id);

    let optionRows: OptionRow[] = [];
    if (questionIds.length > 0) {
      const { data: optionData } = await this.client
        .from('poll_options')
        .select('id, question_id, position, label')
        .in('question_id', questionIds)
        .order('position');
      optionRows = (optionData as OptionRow[] | null) ?? [];
    }

    const { data: responseData } = await this.client
      .from('poll_responses')
      .select('id, respondent_name, user_id, created_at')
      .eq('poll_id', pollId)
      .order('created_at');
    const responseRows =
      (responseData as
        | { id: string; respondent_name: string; user_id: string | null; created_at: string }[]
        | null) ?? [];
    const responseIds = responseRows.map((r) => r.id);

    let answerRows: { poll_response_id: string; option_id: string }[] = [];
    if (responseIds.length > 0) {
      const { data: answerData } = await this.client
        .from('poll_answers')
        .select('poll_response_id, option_id')
        .in('poll_response_id', responseIds);
      answerRows = (answerData as { poll_response_id: string; option_id: string }[] | null) ?? [];
    }

    const countByOption = new Map<string, number>();
    const optionsByResponse = new Map<string, string[]>();
    for (const a of answerRows) {
      countByOption.set(a.option_id, (countByOption.get(a.option_id) ?? 0) + 1);
      const list = optionsByResponse.get(a.poll_response_id) ?? [];
      list.push(a.option_id);
      optionsByResponse.set(a.poll_response_id, list);
    }

    return {
      id: poll.id,
      shortCode: poll.short_code ?? '',
      title: poll.title,
      description: poll.description,
      status: poll.status as PollStatus,
      closesAt: poll.closes_at,
      showRespondentNames: poll.show_respondent_names,
      eventId: poll.event_id,
      groupId: poll.group_id,
      responseCount: responseRows.length,
      questions: questionRows.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        kind: q.kind as PollQuestionKind,
        required: q.required,
        options: optionRows
          .filter((o) => o.question_id === q.id)
          .map((o) => ({ id: o.id, label: o.label, count: countByOption.get(o.id) ?? 0 })),
      })),
      responses: responseRows.map((r) => ({
        id: r.id,
        respondentName: r.respondent_name,
        userId: r.user_id,
        createdAt: r.created_at,
        optionIds: optionsByResponse.get(r.id) ?? [],
      })),
    };
  }

  listByCreator(creatorId: string): Promise<PollSummary[]> {
    return this.listWhere('creator_id', creatorId);
  }

  listByEvent(eventId: string): Promise<PollSummary[]> {
    return this.listWhere('event_id', eventId);
  }

  listByGroup(groupId: string): Promise<PollSummary[]> {
    return this.listWhere('group_id', groupId);
  }

  private async listWhere(
    column: 'creator_id' | 'event_id' | 'group_id',
    value: string,
  ): Promise<PollSummary[]> {
    const { data: pollData, error } = await this.client
      .from('polls')
      .select('id, short_code, title, status, closes_at, created_at')
      .eq(column, value)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Poll.list failed: ${error.message}`);
    const polls =
      (pollData as
        | {
            id: string;
            short_code: string | null;
            title: string;
            status: string;
            closes_at: string | null;
            created_at: string;
          }[]
        | null) ?? [];
    if (polls.length === 0) return [];

    const pollIds = polls.map((p) => p.id);
    const [{ data: questionData }, { data: responseData }] = await Promise.all([
      this.client.from('poll_questions').select('poll_id').in('poll_id', pollIds),
      this.client.from('poll_responses').select('poll_id').in('poll_id', pollIds),
    ]);
    const questionCount = tally((questionData as { poll_id: string }[] | null) ?? []);
    const responseCount = tally((responseData as { poll_id: string }[] | null) ?? []);

    return polls.map((p) => ({
      id: p.id,
      shortCode: p.short_code ?? '',
      title: p.title,
      status: p.status as PollStatus,
      closesAt: p.closes_at,
      questionCount: questionCount.get(p.id) ?? 0,
      responseCount: responseCount.get(p.id) ?? 0,
      createdAt: p.created_at,
    }));
  }
}

function tally(rows: { poll_id: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.poll_id, (map.get(r.poll_id) ?? 0) + 1);
  return map;
}
