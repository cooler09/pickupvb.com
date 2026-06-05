import { notFound } from 'next/navigation';
import { isValidRoomCode, normalizeRoomCode } from '../../_lib/room-code.js';
import { RotationBoard } from '../_components/rotation-board.js';

export const metadata = {
  title: 'Court rotation',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RotationRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ code: rawCode }, sp] = await Promise.all([params, searchParams]);
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) notFound();
  // `courts` is only a fallback for a fresh room — the first realtime broadcast
  // (and any team added) overrides it, so a device opening the bare link still
  // catches up to the live board.
  const courts = Number(single(sp['courts']));
  const initialCourtCount = Number.isFinite(courts) && courts > 0 ? Math.floor(courts) : 1;
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Court rotation</h1>
        <p className="text-muted text-sm">
          Winners stay on, losers rotate to the back. Share the link so everyone can report results.
        </p>
      </header>
      <RotationBoard code={code} initialCourtCount={initialCourtCount} />
    </section>
  );
}
