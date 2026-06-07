import Link from 'next/link';
import type { Route } from 'next';
import { ProfileForm } from './profile-form';
import { AvatarPanel } from '@/components/avatar-panel';
import { MyGroupsSection } from './_components/my-groups-section';
import { BadgeShelf } from '@/components/badge-shelf';
import { BadgeUnlockToast } from '@/components/badge-unlock-toast';
import { KonamiListener } from '@/components/konami-listener';
import { OnboardingChecklist } from './_components/onboarding-checklist';
import { SectionHeader, cardClass } from './_components/profile-section-primitives';
import {
  FollowingSection,
  HostingSection,
  PendingInvitesSection,
  ProfileIdentityHero,
  ProfileQuickActions,
  VideosSection,
  YourEventsSection,
} from './_components/profile-hub-sections';
import { loadProfilePage } from './_loaders/load-profile-page';

export const metadata = {
  title: 'Your profile — PickupVB',
  robots: { index: false, follow: false },
};

export default async function ProfilePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const {
    userId,
    userEmail,
    profile,
    displayInitials,
    positions,
    viewerIsPro,
    viewerIsAdmin,
    isHost,
    newlyGrantedBadges,
    shelfBadges,
    friends,
    mutualIds,
    attendingEvents,
    upcomingHosted,
    groupsForSection,
    myVideos,
    pendingInvites,
    playerOnboarding,
    hostOnboarding,
    showPlayerOnboarding,
    showHostOnboarding,
    editOpen,
    searchParams,
    hpage,
    fpage,
    vpage,
    apage,
  } = await loadProfilePage(await props.searchParams);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <ProfileIdentityHero
        profile={profile}
        userEmail={userEmail}
        displayInitials={displayInitials}
        positions={positions}
        viewerIsAdmin={viewerIsAdmin}
        viewerIsPro={viewerIsPro}
      />

      {/* Achievement badges (gamification Phase 1) — owner sees locked teasers. */}
      <BadgeUnlockToast newlyGranted={newlyGrantedBadges} />
      <KonamiListener />
      <BadgeShelf earned={shelfBadges} showLocked heading="Your badges" />

      {/* Onboarding checklists (ADR 0035). Player track first (everyone), then the
          host track for viewers showing host intent. Each hides once its required
          steps are done. */}
      {showPlayerOnboarding && (
        <OnboardingChecklist
          heading="Get started"
          intro="A few quick steps to get the most out of your account."
          progress={playerOnboarding}
        />
      )}
      {showHostOnboarding && (
        <OnboardingChecklist
          heading="Host setup"
          intro="Finish setting up so players can find and pay for your events."
          progress={hostOnboarding.progress}
        />
      )}

      <ProfileQuickActions isHost={isHost} />

      {pendingInvites.length > 0 && <PendingInvitesSection invites={pendingInvites} />}

      <YourEventsSection events={attendingEvents} page={apage} searchParams={searchParams} />

      <FollowingSection
        friends={friends}
        mutualIds={mutualIds}
        page={fpage}
        searchParams={searchParams}
      />

      <HostingSection events={upcomingHosted} page={hpage} searchParams={searchParams} />

      <section className={cardClass}>
        <MyGroupsSection groups={groupsForSection} />
      </section>

      <VideosSection items={myVideos} page={vpage} searchParams={searchParams} />

      {/* Edit profile — fields + profile photo co-located under one disclosure
          so the identity-edit affordances live together (PR-4). */}
      <details
        id="edit-profile"
        open={editOpen}
        className="group border-border-base bg-surface rounded-shape-sm border"
      >
        <summary className="hover:bg-fg/5 flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-medium">
          <span>Edit profile</span>
          <span className="text-muted text-xs group-open:hidden">
            Name, city, positions, photos, socials…
          </span>
          <span className="text-muted hidden text-xs group-open:inline">Collapse</span>
        </summary>
        <div className="border-border-base space-y-6 border-t p-4 sm:p-6">
          <ProfileForm profile={profile} email={userEmail} isPro={viewerIsPro} />
          <AvatarPanel
            userId={userId}
            currentUrl={profile.avatar_url}
            initials={displayInitials}
            returnPath={`/players/${profile.handle}`}
          />
        </div>
      </details>

      {/* Privacy & your data */}
      <section className={cardClass}>
        <SectionHeader title="Privacy & your data" />
        <p className="text-muted mt-2 text-sm">
          Download a copy of your PickupVB data — your profile, events, payments, messages, and more
          — as a single JSON file.
        </p>
        {/* Plain anchor: the route streams a file download (content-disposition:
            attachment), so a server-rendered link is all that's needed. */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href="/api/account/export"
            download
            className="border-border-base hover:bg-fg/5 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            Download my data
          </a>
          <Link
            href={'/profile/account/delete' as Route}
            className="text-md-error text-sm font-medium hover:underline"
          >
            Delete account
          </Link>
        </div>
      </section>
    </div>
  );
}
