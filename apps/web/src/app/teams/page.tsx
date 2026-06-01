import Link from 'next/link';
import { SupabaseTeamQueryRepository } from '@pickupvb/infrastructure';
import { createSupabaseAnonClient } from '@pickupvb/supabase/anon';
import { FORMAT_LABEL } from '@/lib/enum-labels';
import { Pagination } from '@/components/pagination';
import { primaryButtonClass } from '@/components/primary-button';
import { fieldInputClass } from '@/components/field-styles';
import { MyTeamsPanel } from './_components/my-teams-panel';
import { TeamCard } from './_components/team-card';

// Public "discover" listing rendered with the sessionless anon client so
// the route stays ISR-cacheable. Viewer-only sections (captained, rostered,
// pending invites, create-team CTA) live in <MyTeamsPanel /> as a client
// component to avoid pulling `cookies()` into the RSC path.
export const revalidate = 60;

export const metadata = {
  title: 'Tournament teams',
  description:
    'Browse, manage, and discover tournament volleyball teams on PickupVB. Build a roster, recruit players, and sign up for tournaments together.',
  alternates: { canonical: '/teams' },
  openGraph: {
    title: 'Tournament teams · PickupVB',
    description: 'Browse, manage, and discover tournament volleyball teams on PickupVB.',
    url: '/teams',
    type: 'website',
    siteName: 'PickupVB',
  },
};

const PAGE_SIZE = 24;
const FORMAT_OPTIONS = ['doubles', 'triples', 'quads', 'sixes'] as const;
type FormatOption = (typeof FORMAT_OPTIONS)[number];

export default async function TeamsIndexPage(props: {
  searchParams: Promise<{ q?: string; format?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = createSupabaseAnonClient();

  // Parse discover filters (apply to public browse below).
  const q = (searchParams.q ?? '').trim();
  const format: FormatOption | undefined = FORMAT_OPTIONS.includes(
    searchParams.format as FormatOption,
  )
    ? (searchParams.format as FormatOption)
    : undefined;
  const pageNum = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  // Public "discover" listing — runs for everyone, signed in or not. The read,
  // captain-name resolution, and per-team roster counts (TM-1) all live behind
  // the TeamQueries port (TM-4).
  const { cards: discoverTeams, total: discoverTotal } = await new SupabaseTeamQueryRepository(
    supabase,
  ).searchDirectory({
    ...(q ? { nameLike: q } : {}),
    ...(format ? { format } : {}),
    limit: PAGE_SIZE,
    offset: from,
  });
  const hasFilter = q.length > 0 || !!format;

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-muted text-sm">
            Build a roster once, then sign up for tournaments together.
          </p>
        </div>
      </header>

      <MyTeamsPanel />

      <section className="space-y-3">
        <div>
          <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">
            Discover teams · {discoverTotal}
          </h2>
          <p className="text-muted text-xs">Browse public tournament rosters across PickupVB.</p>
        </div>
        <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <input
            type="search"
            name="q"
            placeholder="Search by team name…"
            defaultValue={q}
            className={fieldInputClass}
          />
          <select
            name="format"
            defaultValue={format ?? ''}
            className={fieldInputClass}
            aria-label="Filter by format"
          >
            <option value="">Any format</option>
            {FORMAT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f] ?? f}
              </option>
            ))}
          </select>
          <button type="submit" className={primaryButtonClass()}>
            Search
          </button>
        </form>
        {discoverTeams.length === 0 ? (
          <div className="border-border-base rounded-shape-sm flex flex-col items-center gap-3 border border-dashed p-8 text-center">
            <p className="text-fg text-sm font-medium">
              {hasFilter ? 'No teams match those filters.' : 'No teams yet.'}
            </p>
            <p className="text-muted text-xs">
              {hasFilter
                ? 'Try a different name or format, or clear the filters.'
                : 'Be the first — teams sign up for tournaments together with a saved roster.'}
            </p>
            {!hasFilter && (
              <Link href="/teams/new" className={primaryButtonClass()}>
                + New team
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {discoverTeams.map((t) => (
              <TeamCard
                key={t.id}
                team={{
                  id: t.id,
                  slug: t.slug,
                  name: t.name,
                  format: t.format,
                  captain_id: t.captainId,
                }}
                role="public"
                captainName={t.captainName}
                rosterCount={t.rosterCount}
                teamSize={t.teamSize}
              />
            ))}
          </ul>
        )}
        <Pagination
          basePath="/teams"
          page={pageNum}
          pageSize={PAGE_SIZE}
          total={discoverTotal}
          searchParams={searchParams}
        />
      </section>
    </div>
  );
}
