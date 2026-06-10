import { SupabaseTeamQueryRepository } from '@pickupvb/infrastructure';
import { createSupabaseAnonClient } from '@pickupvb/supabase/anon';
import { Pagination } from '@/components/pagination';
import { primaryButtonClass } from '@/components/primary-button';
import { fieldInputClass } from '@/components/field-styles';
import { Alert } from '@/components/alert';
import { EmptyState } from '@/components/empty-state';
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

export default async function TeamsIndexPage(props: {
  searchParams: Promise<{ q?: string; page?: string; deleted?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = createSupabaseAnonClient();

  // Parse discover filters (apply to public browse below).
  const q = (searchParams.q ?? '').trim();
  const pageNum = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  // Public "discover" listing — runs for everyone, signed in or not. The read,
  // captain-name resolution, and per-team roster counts (TM-1) all live behind
  // the TeamQueries port (TM-4).
  const { cards: discoverTeams, total: discoverTotal } = await new SupabaseTeamQueryRepository(
    supabase,
  ).searchDirectory({
    ...(q ? { nameLike: q } : {}),
    limit: PAGE_SIZE,
    offset: from,
  });
  const hasFilter = q.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline-sm font-bold">Teams</h1>
          <p className="text-muted text-sm">
            Build a roster once, then sign up for tournaments together.
          </p>
        </div>
      </header>

      {searchParams.deleted === '1' && <Alert variant="success">Team deleted.</Alert>}

      <MyTeamsPanel />

      <section className="space-y-3">
        <div>
          <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">
            Discover teams · {discoverTotal}
          </h2>
          <p className="text-muted text-xs">Browse public tournament rosters across PickupVB.</p>
        </div>
        <form className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <input
            type="search"
            name="q"
            placeholder="Search by team name…"
            defaultValue={q}
            className={fieldInputClass}
          />
          <button type="submit" className={primaryButtonClass()}>
            Search
          </button>
        </form>
        {discoverTeams.length === 0 ? (
          hasFilter ? (
            <EmptyState
              title="No teams match those filters"
              description="Try a different name, or clear the search."
              secondary={{ href: '/teams', label: 'Clear search' }}
            />
          ) : (
            <EmptyState
              title="No teams yet"
              description="Teams sign up for tournaments together with a saved roster."
              primary={{ href: '/teams/new', label: '+ New team' }}
              unlocks="Create a team to register for tournaments and keep your roster."
            />
          )
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {discoverTeams.map((t) => (
              <TeamCard
                key={t.id}
                team={{
                  id: t.id,
                  slug: t.slug,
                  name: t.name,
                  captain_id: t.captainId,
                }}
                role="public"
                captainName={t.captainName}
                rosterCount={t.rosterCount}
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
