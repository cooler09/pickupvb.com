import { notFound } from 'next/navigation';
import type { Metadata } from 'next/types';
import { requireRealUser } from '@/lib/server-auth';
import { isPlatformAdmin } from '@/lib/admin';
import ImportClient from './import-client';

export const metadata: Metadata = {
  title: 'Import community listings',
  robots: { index: false, follow: false },
};

// Bulk import geocodes + upserts every row inside the import server action.
// The client chunks the upload so each call stays small, but raise the function
// ceiling as defense-in-depth for a large single chunk (Vercel clamps to the
// plan max). Default is well under what a 60-row geocode pass can need.
export const maxDuration = 300;

export default async function CommunityImportPage() {
  const viewer = await requireRealUser('/admin/community-import');
  if (!(await isPlatformAdmin(viewer.user.id))) notFound();

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-headline-lg font-bold">Import community listings</h1>
        <p className="text-muted mt-1 text-sm">
          Admin-only. Generate a listings JSON file with the{' '}
          <code className="bg-fg/5 rounded px-1">facebook-events-import</code> Claude Code skill,
          upload it here, review and fix each draft, then create them in bulk. Listings are created
          under your account and skip the normal daily submission limit.
        </p>
      </div>
      <ImportClient />
    </section>
  );
}
