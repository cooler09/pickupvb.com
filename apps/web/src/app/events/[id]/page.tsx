import Link from 'next/link';

export default function EventDetailPage({ params }: { params: { id: string } }) {
    return (
        <section className="space-y-4">
            <Link href="/events" className="text-court-600 hover:underline">
                ← Back to events
            </Link>
            <h1 className="text-3xl font-bold">Event {params.id}</h1>
            <p className="text-net-800/70">
                Event detail page coming soon. Will fetch from the API and subscribe to live spot
                updates via <code className="rounded bg-net-900/5 px-1">useEventAttendees</code>.
            </p>
        </section>
    );
}
