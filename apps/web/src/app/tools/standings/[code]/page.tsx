import { notFound } from 'next/navigation';
import { isValidRoomCode, normalizeRoomCode } from '../../_lib/room-code.js';
import { StandingsBoard } from '../_components/standings-board.js';

export const metadata = {
  title: 'Standings',
  robots: { index: false, follow: false },
};

export default async function StandingsRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) notFound();
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-headline-sm font-bold">Standings</h1>
        <p className="text-muted text-sm">
          Record results and the table sorts itself. Share the link so everyone can update it.
        </p>
      </header>
      <StandingsBoard code={code} />
    </section>
  );
}
