export default function ToolsPage() {
    const tools = [
        { slug: 'bracket', title: 'Tournament bracket creator', desc: 'Single & double elimination.' },
        { slug: 'seeding', title: 'Seeding generator', desc: 'Snake / random / ranked.' },
        { slug: 'scoreboard', title: 'Live score tracker', desc: 'Rally scoring with sets.' },
        { slug: 'standings', title: 'Win/loss tracker', desc: 'Round-robin standings.' },
    ];
    return (
        <section className="space-y-6">
            <h1 className="text-3xl font-bold">Host tools</h1>
            <p className="text-net-800/70">Utilities for running your event smoothly.</p>
            <ul className="grid gap-4 sm:grid-cols-2">
                {tools.map((t) => (
                    <li key={t.slug} className="rounded-lg border border-net-900/10 p-4">
                        <h2 className="font-semibold">{t.title}</h2>
                        <p className="text-sm text-net-800/70">{t.desc}</p>
                        <p className="mt-2 text-xs uppercase tracking-wide text-court-600">Coming soon</p>
                    </li>
                ))}
            </ul>
        </section>
    );
}
