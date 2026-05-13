import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function HomePage({
    searchParams,
}: {
    searchParams?: { code?: string; type?: string };
}) {
    // Supabase sometimes lands recovery/OAuth codes here when its allow-list falls back to Site URL.
    // Forward to the appropriate callback so the user doesn't get stranded.
    if (searchParams?.code) {
        const target =
            searchParams.type === 'recovery'
                ? '/auth/reset-password'
                : '/auth/callback';
        redirect(`${target}?code=${encodeURIComponent(searchParams.code)}`);
    }

    return (
        <section className="grid gap-10 md:grid-cols-2 md:items-center">
            <div className="space-y-6">
                <h1 className="text-4xl font-bold leading-tight md:text-5xl">
                    Find your next <span className="text-primary">volleyball</span> game.
                </h1>
                <p className="text-lg text-fg/80">
                    Pickup, leagues, and tournaments — indoor, grass, and beach. Host an event in
                    minutes and let players sign up automatically.
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/events"
                        className="rounded-md bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary/90"
                    >
                        Find events near me
                    </Link>
                    <Link
                        href="/events/new"
                        className="rounded-md border border-border-base px-5 py-2.5 font-medium hover:bg-fg/5"
                    >
                        Host an event
                    </Link>
                </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-highlight/30 p-8">
                <ul className="space-y-3 text-fg">
                    <li>🏐 6s, quads, triples, doubles</li>
                    <li>🏖️ Sand, grass, and indoor</li>
                    <li>🧑‍🤝‍🧑 Men&apos;s, women&apos;s, coed</li>
                    <li>⚡ Real-time spot updates</li>
                    <li>🏆 Tournament tools for hosts</li>
                </ul>
            </div>
        </section>
    );
}
