import { notFound } from 'next/navigation';
import type { Metadata } from 'next/types';
import { requireRealUser } from '@/lib/server-auth';
import { isPlatformAdmin } from '@/lib/admin';
import ImportClient from './import-client';

export const metadata: Metadata = {
  title: 'Import community listings',
  robots: { index: false, follow: false },
};

export default async function CommunityImportPage() {
  const viewer = await requireRealUser('/admin/community-import');
  if (!(await isPlatformAdmin(viewer.user.id))) notFound();

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import community listings</h1>
        <p className="text-muted mt-1 text-sm">
          Admin-only. Paste the text of one or more events (e.g. from Facebook) to draft community
          listings, review them, then create them in bulk. Listings are created under your account
          and skip the normal daily submission limit.
        </p>
      </div>
      <ImportClient />
    </section>
  );
}
