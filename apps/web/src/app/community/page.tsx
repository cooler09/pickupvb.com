import Link from 'next/link';
import type { Metadata } from 'next/types';
import { SearchCommunityListingsQuery } from '@pickupvb/application';
import { SURFACE_LABEL, FORMAT_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { handlers } from '@/lib/handlers';
import { getCurrentUser } from '@/lib/server-auth';
import { CommunityListingCard } from './_components/community-listing-card';

const SURFACES = ['indoor', 'grass', 'sand'] as const;
const FORMATS = ['sixes', 'quads', 'triples', 'doubles'] as const;
const SKILLS = ['beginner', 'intermediate', 'advanced', 'competitive'] as const;

type Surface = (typeof SURFACES)[number];
type Format = (typeof FORMATS)[number];
type Skill = (typeof SKILLS)[number];

export const metadata: Metadata = {
  title: 'Community listings',
  description:
    'Volleyball events shared by the PickupVB community. Submit a Facebook post, Meetup, or other external event so others in your area can find it.',
  alternates: { canonical: '/community' },
  openGraph: {
    title: 'Community listings · PickupVB',
    description:
      'Discover volleyball events posted by the community — outbound links to Facebook, Meetup, and more.',
    url: '/community',
    type: 'website',
  },
};

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

export default async function CommunityListingsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const { user } = await getCurrentUser();

  const get = (k: string): string | undefined => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const surface: Surface | undefined = pick(get('surface'), SURFACES);
  const format: Format | undefined = pick(get('format'), FORMATS);
  const skillLevel: Skill | undefined = pick(get('skill'), SKILLS);

  const now = new Date();
  const listings = await handlers.searchCommunityListings.execute(
    new SearchCommunityListingsQuery(user?.id ?? null, {
      limit: 60,
      startsAfter: now,
      ...(surface ? { surface } : {}),
      ...(format ? { format } : {}),
      ...(skillLevel ? { skillLevel } : {}),
    }),
  );

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Community listings</h1>
          <p className="text-muted mt-1 max-w-2xl text-sm">
            Volleyball events shared by other players — Facebook posts, Meetup groups, and other
            links from around the web. Anyone can submit a listing for an event they&rsquo;re not
            hosting.
          </p>
        </div>
        {user ? (
          <Link
            href="/community/new"
            className="bg-primary hover:bg-primary/90 shrink-0 rounded-md px-4 py-2 font-medium text-white"
          >
            Submit a listing
          </Link>
        ) : (
          <Link
            href={{ pathname: '/login', query: { next: '/community/new' } }}
            className="bg-primary hover:bg-primary/90 shrink-0 rounded-md px-4 py-2 font-medium text-white"
          >
            Sign in to submit
          </Link>
        )}
      </div>

      <form
        method="get"
        className="border-border-base bg-surface grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <label className="text-sm">
          <span className="text-muted block text-xs font-semibold tracking-wide uppercase">
            Surface
          </span>
          <select
            name="surface"
            defaultValue={surface ?? ''}
            className="border-border-base mt-1 w-full rounded-md border px-2 py-1.5"
          >
            <option value="">Any</option>
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {SURFACE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted block text-xs font-semibold tracking-wide uppercase">
            Format
          </span>
          <select
            name="format"
            defaultValue={format ?? ''}
            className="border-border-base mt-1 w-full rounded-md border px-2 py-1.5"
          >
            <option value="">Any</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted block text-xs font-semibold tracking-wide uppercase">
            Skill
          </span>
          <select
            name="skill"
            defaultValue={skillLevel ?? ''}
            className="border-border-base mt-1 w-full rounded-md border px-2 py-1.5"
          >
            <option value="">Any</option>
            {SKILLS.map((s) => (
              <option key={s} value={s}>
                {SKILL_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="bg-primary hover:bg-primary/90 h-[34px] rounded-md px-4 text-sm font-semibold text-white"
          >
            Apply
          </button>
        </div>
      </form>

      <p className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
        Community listings link out to external sites. PickupVB doesn&rsquo;t verify or moderate the
        events themselves. RSVP and pay through the linked source.
      </p>

      {listings.length === 0 ? (
        <p className="bg-highlight/30 text-muted rounded-md p-6 text-center">
          No community listings match your filters yet. Know about an event we should add?{' '}
          <Link href="/community/new" className="text-primary font-semibold hover:underline">
            Submit one.
          </Link>
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <CommunityListingCard key={l.id} listing={l} />
          ))}
        </ul>
      )}
    </section>
  );
}
