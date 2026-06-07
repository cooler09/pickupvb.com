import SentryTestClient from './_components/sentry-test-client';

export const metadata = {
  title: 'Sentry test',
  robots: { index: false, follow: false },
};

export default function SentryTestPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-headline-lg font-bold">Sentry test</h1>
        <p className="text-muted">
          Trigger errors and messages to verify the Sentry integration. Check the Sentry dashboard
          for matching events.
        </p>
      </header>
      <SentryTestClient />
    </section>
  );
}
