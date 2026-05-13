import Link from 'next/link';

export default function HomePage() {
    return (
        <section className="grid gap-10 md:grid-cols-2 md:items-center">
            <div className="space-y-6">
                <h1 className="text-4xl font-bold leading-tight md:text-5xl">
                    Find your next <span className="text-court-600">volleyball</span> game.
                </h1>
                <p className="text-lg text-net-800/80">
                    Pickup, leagues, and tournaments — indoor, grass, and beach. Host an event in
                    minutes and let players sign up automatically.
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/events"
                        className="rounded-md bg-court-600 px-5 py-2.5 font-medium text-white hover:bg-court-700"
                    >
                        Find events near me
                    </Link>
                    <Link
                        href="/events/new"
                        className="rounded-md border border-net-900/20 px-5 py-2.5 font-medium hover:bg-net-900/5"
                    >
                        Host an event
                    </Link>
                </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-court-100 to-sand-100 p-8">
                <ul className="space-y-3 text-net-900">
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
