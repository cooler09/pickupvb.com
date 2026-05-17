import Link from 'next/link';

export const metadata = {
    title: 'Page not found',
    robots: { index: false, follow: false },
};

export default function NotFound() {
    return (
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">404</p>
            <h1 className="mt-2 text-3xl font-bold text-fg">Page not found</h1>
            <p className="mt-3 text-fg/80">
                The page you’re looking for doesn’t exist or has been moved.
            </p>

            <nav aria-label="Recovery links" className="mt-8 grid gap-3 sm:grid-cols-2">
                <Link
                    href="/events"
                    className="rounded-lg border border-border-base bg-surface px-4 py-3 text-left hover:bg-fg/5"
                >
                    <div className="font-semibold text-fg">Find events</div>
                    <div className="text-sm text-muted">Browse pickup volleyball near you.</div>
                </Link>
                <Link
                    href="/groups"
                    className="rounded-lg border border-border-base bg-surface px-4 py-3 text-left hover:bg-fg/5"
                >
                    <div className="font-semibold text-fg">Groups</div>
                    <div className="text-sm text-muted">Discover clubs and crews.</div>
                </Link>
                <Link
                    href="/players"
                    className="rounded-lg border border-border-base bg-surface px-4 py-3 text-left hover:bg-fg/5"
                >
                    <div className="font-semibold text-fg">Players</div>
                    <div className="text-sm text-muted">Find people in your area.</div>
                </Link>
                <Link
                    href="/teams"
                    className="rounded-lg border border-border-base bg-surface px-4 py-3 text-left hover:bg-fg/5"
                >
                    <div className="font-semibold text-fg">Teams</div>
                    <div className="text-sm text-muted">Tournament rosters and recruiting.</div>
                </Link>
            </nav>

            <p className="mt-8 text-sm">
                <Link href="/" className="text-primary hover:underline">
                    ← Back to home
                </Link>
            </p>
        </main>
    );
}
