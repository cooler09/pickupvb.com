type Props = {
  /** Tooltip / aria-label override. */
  title?: string;
};

/**
 * Small pill that marks a platform administrator. Source of truth is
 * `isPlatformAdmin(userId)` from `@/lib/admin` — call that and
 * conditionally render this badge.
 *
 * Admins also receive every Pro-tier benefit (see `hasProBenefits`),
 * but display this Admin badge in place of the Pro badge so the two
 * roles are visually distinct.
 */
export function AdminBadge({ title }: Props) {
  const label = title ?? 'Platform admin — moderator and PickupVB staff';
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase shadow-sm"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
        <path d="M10 1.8l7 3v4.6c0 4.1-2.9 7.9-7 8.8-4.1-.9-7-4.7-7-8.8V4.8l7-3zm-.95 11.6l5.2-5.2-1.4-1.4-3.8 3.8-1.7-1.7-1.4 1.4 3.1 3.1z" />
      </svg>
      Admin
    </span>
  );
}
