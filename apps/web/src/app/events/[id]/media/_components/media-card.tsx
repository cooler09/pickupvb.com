import type { AwardCategory, EventAwards, MediaPostItem } from '@pickupvb/domain';
import { VideoEmbed } from '@/components/video-embed';
import {
  endLiveStreamFromForm,
  featureStreamFromForm,
  removeMediaFromForm,
  reportMediaFromForm,
  retractVoteFromForm,
  unfeatureMediaFromForm,
  voteFromForm,
} from '../actions';

const actionButtonClass =
  'rounded-md border border-border-base px-2.5 py-1 text-xs font-medium text-fg hover:bg-fg/5';

const voteChipBase =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium';

/**
 * Award vote toggle for one category. Highlighted when the viewer's current
 * vote is this clip; clicking it then retracts (otherwise it casts/moves the
 * vote). Renders a static count chip for non-real-account viewers.
 */
function VoteChip({
  eventId,
  postId,
  category,
  emoji,
  label,
  count,
  voted,
  canVote,
}: {
  eventId: string;
  postId: string;
  category: AwardCategory;
  emoji: string;
  label: string;
  count: number;
  voted: boolean;
  canVote: boolean;
}) {
  const text = `${emoji} ${label} · ${count}`;
  if (!canVote) {
    return <span className={`${voteChipBase} border-border-base text-muted`}>{text}</span>;
  }
  const action = voted
    ? retractVoteFromForm.bind(null, eventId, category)
    : voteFromForm.bind(null, eventId, category, postId);
  return (
    <form action={action}>
      <button
        type="submit"
        aria-pressed={voted}
        className={
          voted
            ? `${voteChipBase} border-primary bg-primary/10 text-primary`
            : `${voteChipBase} border-border-base text-fg hover:bg-fg/5`
        }
      >
        {text}
      </button>
    </form>
  );
}

/**
 * One media post: the embed (or link card), a title/submitter line, and the
 * viewer-appropriate controls. `canManageEvent` (host/admin) unlocks
 * feature/unfeature on live streams; `item.canManage` (owner/host/admin)
 * unlocks remove + end-stream; any other real user can report once.
 */
export function MediaCard({
  item,
  eventId,
  canManageEvent,
  viewerIsRealUser,
  awards,
}: {
  item: MediaPostItem;
  eventId: string;
  canManageEvent: boolean;
  viewerIsRealUser: boolean;
  awards: EventAwards;
}) {
  const showFeatureToggle = canManageEvent && item.kind === 'live_stream' && item.isLive;
  const canReport = viewerIsRealUser && !item.canManage && !item.hasReported;
  const counts = awards.counts[item.id] ?? { best_clip: 0, biggest_fail: 0 };

  return (
    <div className="border-border-base rounded-shape-sm space-y-2 border p-3">
      <VideoEmbed
        provider={item.provider}
        externalId={item.externalId}
        subtype={item.subtype}
        videoUrl={item.videoUrl}
        title={item.title}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {item.isLive && (
          <span className="bg-md-error/15 text-md-error inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
            <span aria-hidden="true">🔴</span> Live
          </span>
        )}
        {item.featured && (
          <span className="bg-md-warning/15 text-md-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
            <span aria-hidden="true">★</span> Featured
          </span>
        )}
        {item.status === 'hidden' && (
          <span className="bg-fg/10 text-muted rounded-full px-2 py-0.5 text-xs font-medium">
            Hidden
          </span>
        )}
      </div>

      <h3 className="text-fg font-medium">{item.title}</h3>
      {item.description && (
        <p className="text-muted text-sm whitespace-pre-wrap">{item.description}</p>
      )}
      <p className="text-muted text-xs">Posted by {item.submitter.displayName}</p>

      {item.kind === 'clip' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <VoteChip
            eventId={eventId}
            postId={item.id}
            category="best_clip"
            emoji="🏆"
            label="Best clip"
            count={counts.best_clip}
            voted={awards.viewerVotes.best_clip === item.id}
            canVote={viewerIsRealUser}
          />
          <VoteChip
            eventId={eventId}
            postId={item.id}
            category="biggest_fail"
            emoji="💀"
            label="Biggest fail"
            count={counts.biggest_fail}
            voted={awards.viewerVotes.biggest_fail === item.id}
            canVote={viewerIsRealUser}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {showFeatureToggle &&
          (item.featured ? (
            <form action={unfeatureMediaFromForm.bind(null, eventId, item.id)}>
              <button type="submit" className={actionButtonClass}>
                Unfeature
              </button>
            </form>
          ) : (
            <form action={featureStreamFromForm.bind(null, eventId, item.id)}>
              <button type="submit" className={actionButtonClass}>
                ★ Feature
              </button>
            </form>
          ))}

        {item.canManage && item.kind === 'live_stream' && item.isLive && (
          <form action={endLiveStreamFromForm.bind(null, eventId, item.id)}>
            <button type="submit" className={actionButtonClass}>
              End stream
            </button>
          </form>
        )}

        {item.canManage && (
          <form action={removeMediaFromForm.bind(null, eventId, item.id)}>
            <button type="submit" className={`${actionButtonClass} text-md-error`}>
              Remove
            </button>
          </form>
        )}

        {canReport && (
          <form action={reportMediaFromForm.bind(null, eventId, item.id)}>
            <button type="submit" className={`${actionButtonClass} text-muted`}>
              Report
            </button>
          </form>
        )}
        {item.hasReported && <span className="text-muted text-xs">Reported</span>}
      </div>
    </div>
  );
}
