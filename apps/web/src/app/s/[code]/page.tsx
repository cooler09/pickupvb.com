/**
 * Short alias for the scoreboard remote so a host can read the URL aloud
 * at a gym ("pickupvb.com slash s slash A B C D") and players can type
 * it without trailing path segments. Redirects to the canonical
 * `/tools/scoreboard/{code}/remote` URL.
 *
 * Invalid codes 404 rather than redirect, so a typo doesn't silently
 * deposit the user on a dead realtime room.
 */
import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import { isValidRoomCode, normalizeRoomCode } from '../../tools/scoreboard/_lib/room-code.js';

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function ShortRemoteAliasPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = await params;
  const code = normalizeRoomCode(raw);
  if (!isValidRoomCode(code)) notFound();
  redirect(`/tools/scoreboard/${code}/remote` as Route);
}
