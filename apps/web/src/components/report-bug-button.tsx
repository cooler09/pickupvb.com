'use client';

import { useId, useRef, useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';

/**
 * Opens a modal that collects a short title + description, then opens a
 * prefilled GitHub "new issue" page in a new tab. No server round-trip,
 * no token required — the user finishes submission on GitHub.
 *
 * The body includes useful context (page URL, user agent, viewport, time,
 * and optional error info when triggered from an error boundary).
 */

const REPO = 'cooler09/pickupvb.com';
const ISSUE_TEMPLATE = 'bug-report.yml';

export function ReportBugButton({
  variant = 'link',
  label = 'Report a bug',
  errorDigest,
  errorMessage,
}: {
  variant?: 'link' | 'button';
  label?: string;
  /** Sentry/Next.js error digest to include in the issue body. */
  errorDigest?: string;
  /** Short error message to include in the issue body. */
  errorMessage?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const titleId = useId();
  const descId = useId();

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (typeof window === 'undefined') return;

    const url = window.location.href;
    const ua = navigator.userAgent;
    const viewport = `${window.innerWidth}x${window.innerHeight}`;
    const time = new Date().toISOString();

    const envLines: string[] = [
      `- User agent: ${ua}`,
      `- Viewport: ${viewport}`,
      `- Time (UTC): ${time}`,
    ];
    if (errorDigest) envLines.push(`- Error digest: \`${errorDigest}\``);
    if (errorMessage) envLines.push(`- Error message: \`${errorMessage}\``);

    const params = new URLSearchParams({
      template: ISSUE_TEMPLATE,
      title: `Bug: ${title.trim() || 'unspecified'}`,
      'what-happened': description.trim() || '(no description provided)',
      page: url,
      environment: envLines.join('\n'),
    });

    const issueUrl = `https://github.com/${REPO}/issues/new?${params.toString()}`;

    window.open(issueUrl, '_blank', 'noopener,noreferrer');
    close();
    setTitle('');
    setDescription('');
  }

  const triggerClass =
    variant === 'button'
      ? 'inline-flex items-center rounded-md border border-border-base bg-md-surface-container px-4 py-2 text-sm font-medium text-fg hover:bg-fg/5'
      : 'text-muted hover:text-fg hover:underline';

  return (
    <>
      <button type="button" onClick={open} className={triggerClass}>
        {label}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="border-border-base bg-md-surface-container text-fg rounded-shape-sm m-auto w-full max-w-md border p-0 shadow-xl backdrop:bg-black/50"
      >
        <form onSubmit={handleSubmit} className="space-y-3 p-5">
          <h2 id={titleId} className="text-base font-semibold">
            Report a bug
          </h2>
          <p id={descId} className="text-muted text-sm">
            Tell us what went wrong. We&apos;ll open a prefilled GitHub issue in a new tab — submit
            it there to send it to our team. A free GitHub account is required.
          </p>

          <div className="space-y-1">
            <label htmlFor="report-bug-title" className="block text-sm font-medium">
              Short summary
            </label>
            <input
              id="report-bug-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
              placeholder="e.g. RSVP button does nothing on iOS Safari"
              className="border-border-base bg-md-surface-container text-fg block w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="report-bug-description" className="block text-sm font-medium">
              What were you trying to do? What happened instead?
            </label>
            <textarea
              id="report-bug-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="Steps to reproduce, what you expected, what you saw."
              className="border-border-base bg-md-surface-container text-fg block w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {(errorDigest || errorMessage) && (
            <p className="text-muted text-xs">Error context will be attached automatically.</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              className="border-border-base bg-md-surface-container hover:bg-fg/5 rounded-md border px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass('md')}>
              Continue to GitHub
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
