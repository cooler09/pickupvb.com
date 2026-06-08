import Link from 'next/link';
import type { Metadata } from 'next';
import { VolleyPong } from './_components/volley-pong';

export const metadata: Metadata = {
  title: 'Volley-pong',
  description: 'A little volleyball-themed pong while you wait for your next game.',
  // A toy route — keep it out of search results and sitemaps.
  robots: { index: false, follow: false },
};

/**
 * Delight #12 (docs/delight-backlog.md): a route-isolated "volley-pong" mini
 * game. Thin server shell around the client `<VolleyPong>` canvas; reachable
 * from the 404 page and the keep-ups card, otherwise undiscovered (noindex).
 */
export default function PlayPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h1 className="text-headline-lg font-bold">Volley-pong 🏐</h1>
        <p className="text-muted mt-1 text-sm">
          You vs. the CPU — first to 7. A little something while you wait for your next game.
        </p>
      </div>
      <VolleyPong />
      <p className="mt-6 text-sm">
        <Link href="/events" className="text-primary hover:underline">
          ← Back to finding events
        </Link>
      </p>
    </div>
  );
}
