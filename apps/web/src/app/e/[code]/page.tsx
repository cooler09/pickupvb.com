import { notFound, redirect } from 'next/navigation';
import type { Route } from 'next';
import { repositories } from '@/lib/handlers';

export const dynamic = 'force-dynamic';

/**
 * Resolve a shareable short code (e.g. /e/ABC23XYZ) to the underlying
 * event UUID and 308-redirect to the canonical /events/<id> URL. The
 * 308 is permanent so social previews/QR scans cache the canonical URL.
 *
 * Codes are normalized server-side: trimmed and uppercased before lookup,
 * matching how `gen_event_short_code()` mints them.
 */
export default async function ShortCodeRedirectPage({
    params,
}: {
    params: { code: string };
}) {
    const id = await repositories.eventRepo.findIdByShortCode(params.code);
    if (!id) notFound();
    redirect(`/events/${id}` as Route);
}
