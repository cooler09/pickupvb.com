import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { createSupabaseAnonClient } from '@pickupvb/supabase/anon';
import { FORMAT_LABEL } from '@/lib/enum-labels';
import { TeamMemberRow, type TeamRosterMember } from './_components/team-member-row';
import { TeamViewerChrome } from './_components/team-viewer-chrome';
import { TeamChatPanel } from './_components/team-chat-panel';
import { TeamJsonLd } from './_components/team-jsonld';
import { ShareLink } from '@/components/share-link';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';

/**
 * ISR cache for anonymous traffic: the public team profile (header,
 * JSON-LD, share link, roster) is fully cacheable. Viewer-conditional
 * chrome (pending-invite accept/decline, captain controls, per-row remove
 * buttons) is rendered by `<TeamViewerChrome />`, a client island that
 * fetches the viewer's session after hydration. See
 * `docs/audits/performance.md` P1 #1.
 */
export const revalidate = 60;

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseAnonClient();
  const { data } = await supabase
    .from('teams')
    .select('slug, name, format')
    .eq('slug', params.id)
    .maybeSingle();
  const row = data as { slug: string; name: string; format: string } | null;
  if (!row) return { title: 'Team' };
  const label = FORMAT_LABEL[row.format as keyof typeof FORMAT_LABEL] ?? row.format;
  const description = `${row.name} — ${label} volleyball team on PickupVB.`;
  return {
    title: row.name,
    description,
    alternates: { canonical: `/teams/${row.slug}` },
    openGraph: {
      title: `${row.name} · PickupVB`,
      description,
      url: `/teams/${row.slug}`,
      type: 'website',
    },
  };
}

type TeamRow = {
  id: string;
  slug: string;
  name: string;
  format: string;
  captain_id: string;
  extra_member_count: number | null;
};

type MemberRow = {
  user_id: string;
  status: 'active' | 'pending' | null;
};

export default async function TeamDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseAnonClient();

  const { data: teamData } = await supabase
    .from('teams')
    .select('id, slug, name, format, captain_id, extra_member_count')
    .eq('slug', params.id)
    .maybeSingle();
  const team = teamData as TeamRow | null;
  if (!team) notFound();

  const extraMembers = team.extra_member_count ?? 0;

  const { data: memberRows } = await supabase
    .from('team_members')
    .select('user_id, status')
    .eq('team_id', team.id);
  const rows = (memberRows as MemberRow[] | null) ?? [];

  // Resolve member profiles via the ProfileQueries port (no FK join on the
  // public view).
  const userIds = rows.map((r) => r.user_id);
  const profileMap = await new SupabaseProfileRepository(supabase).findCardsByIds(userIds);

  const members: TeamRosterMember[] = rows.map((m) => {
    const p = profileMap.get(m.user_id) ?? null;
    return {
      userId: m.user_id,
      status: m.status ?? 'active',
      profile: p ? { displayName: p.displayName, firstName: null, lastName: null } : null,
    };
  });

  // Captain on top, then active alpha, then pending alpha at the bottom.
  members.sort((a, b) => {
    if (a.userId === team.captain_id) return -1;
    if (b.userId === team.captain_id) return 1;
    if (a.status !== b.status) return a.status === 'pending' ? 1 : -1;
    return (a.profile?.displayName ?? '').localeCompare(b.profile?.displayName ?? '');
  });

  const activeCount = members.filter((m) => m.status === 'active').length;
  const pendingCount = members.length - activeCount;

  const returnPath = `/teams/${team.slug}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: 'https://pickupvb.com/' },
          { name: 'Teams', url: 'https://pickupvb.com/teams' },
          { name: team.name, url: `https://pickupvb.com/teams/${team.slug}` },
        ]}
      />
      <TeamJsonLd
        slug={team.slug}
        name={team.name}
        format={team.format}
        memberCount={activeCount + extraMembers}
      />
      <header className="space-y-1">
        <Link href="/teams" className="text-primary text-sm hover:underline">
          ← Back to teams
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <ShareLink path={`/teams/${team.slug}`} title={team.name} />
        </div>
        <p className="text-muted text-sm">
          {FORMAT_LABEL[team.format] ?? team.format} · {activeCount} player
          {activeCount === 1 ? '' : 's'}
          {pendingCount > 0 && ` · ${pendingCount} pending`}
          {extraMembers > 0 && ` · +${extraMembers} off-site`}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">Roster</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <TeamMemberRow
              key={m.userId}
              teamId={team.id}
              member={m}
              isCaptain={m.userId === team.captain_id}
              viewerIsCaptain={false}
              returnPath={returnPath}
            />
          ))}
        </ul>
      </section>

      <TeamViewerChrome
        teamId={team.id}
        teamName={team.name}
        captainId={team.captain_id}
        members={members}
        extraMembers={extraMembers}
        activeCount={activeCount}
        returnPath={returnPath}
      />

      <TeamChatPanel
        teamId={team.id}
        participants={members.map((m) => ({
          id: m.userId,
          name: m.profile?.displayName ?? 'Player',
        }))}
      />
    </div>
  );
}
