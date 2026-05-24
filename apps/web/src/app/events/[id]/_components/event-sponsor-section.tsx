import Image from 'next/image';

type EventSponsor = {
  name: string;
  blurb: string | null;
  linkUrl: string | null;
  logoUrl: string | null;
  discountCode: string | null;
};

export function EventSponsorSection({ sponsor }: { sponsor: EventSponsor | null }) {
  if (!sponsor) return null;

  const body = (
    <div className="space-y-2">
      <p className="text-muted text-xs font-semibold tracking-wide uppercase">Sponsor</p>
      <div className="flex items-start gap-3">
        {sponsor.logoUrl && (
          <Image
            src={sponsor.logoUrl}
            alt={`${sponsor.name} logo`}
            width={48}
            height={48}
            unoptimized
            className="border-border-base bg-surface h-12 w-12 rounded-md border object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="text-fg font-medium">{sponsor.name}</p>
          {sponsor.blurb && <p className="text-muted text-sm">{sponsor.blurb}</p>}
          {sponsor.discountCode && (
            <p className="text-muted mt-1 text-xs">Discount code: {sponsor.discountCode}</p>
          )}
          <p className="text-muted mt-1 text-xs">Arranged by the host.</p>
        </div>
      </div>
    </div>
  );

  return (
    <section className="border-border-base bg-surface rounded-lg border p-4">
      {sponsor.linkUrl ? (
        <a
          href={sponsor.linkUrl}
          target="_blank"
          rel="sponsored noopener nofollow"
          className="focus-visible:ring-primary block rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          {body}
        </a>
      ) : (
        body
      )}
    </section>
  );
}
