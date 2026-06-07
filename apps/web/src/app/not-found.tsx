import Link from 'next/link';

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <p className="text-primary text-sm font-semibold tracking-wide uppercase">404</p>
      <h1 className="text-fg text-headline-lg mt-2 font-bold">Page not found</h1>
      <p className="text-fg/80 mt-3">
        The page you’re looking for doesn’t exist or has been moved.
      </p>

      <nav aria-label="Recovery links" className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          href="/events"
          className="rounded-shape-sm border-border-base bg-md-surface-container hover:bg-fg/5 border px-4 py-3 text-left"
        >
          <div className="text-fg font-semibold">Find events</div>
          <div className="text-muted text-sm">Browse pickup volleyball near you.</div>
        </Link>
        <Link
          href="/groups"
          className="rounded-shape-sm border-border-base bg-md-surface-container hover:bg-fg/5 border px-4 py-3 text-left"
        >
          <div className="text-fg font-semibold">Groups</div>
          <div className="text-muted text-sm">Discover clubs and crews.</div>
        </Link>
        <Link
          href="/players"
          className="rounded-shape-sm border-border-base bg-md-surface-container hover:bg-fg/5 border px-4 py-3 text-left"
        >
          <div className="text-fg font-semibold">Players</div>
          <div className="text-muted text-sm">Find people in your area.</div>
        </Link>
        <Link
          href="/teams"
          className="rounded-shape-sm border-border-base bg-md-surface-container hover:bg-fg/5 border px-4 py-3 text-left"
        >
          <div className="text-fg font-semibold">Teams</div>
          <div className="text-muted text-sm">Tournament rosters and recruiting.</div>
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
