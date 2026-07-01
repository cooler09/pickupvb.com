'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import {
  submitPollResponse,
  type SubmitPollAnswer,
  type SubmitPollResult,
} from '@/lib/polls-public';

/**
 * Sessionless submit for the public responder (ADR 0041). Called imperatively
 * from the client island with structured args (not via `<form action>`, which
 * would hit the useFormState slot-prefix quirk on the dynamic `q_*` fields).
 * Manages a per-poll `pt_<code>` cookie so a returning responder's re-submit is
 * an upsert ("change my answer"), then delegates validation to the RPC.
 */
export async function submitPollResponseAction(input: {
  code: string;
  name: string;
  answers: SubmitPollAnswer[];
  turnstileToken: string | null;
}): Promise<SubmitPollResult> {
  const jar = await cookies();
  const cookieName = `pt_${input.code}`;
  let token = jar.get(cookieName)?.value ?? '';
  if (!token) {
    token = randomUUID();
    jar.set(cookieName, token, {
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }

  return submitPollResponse({
    code: input.code,
    name: input.name,
    anonToken: token,
    answers: input.answers,
    turnstileToken: input.turnstileToken,
  });
}
