'use client';

import { useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { SubmitButton } from '@/components/submit-button';
import { startTipCheckout, startGuestTipCheckout } from '../tip-actions';
import { MIN_TIP_CENTS, MAX_TIP_CENTS } from '../tip-constants';

const PRESETS = [2, 5, 10] as const;

type Props = {
  eventId: string;
  /** True when the viewer is signed in with a non-anonymous (real) account. */
  viewerIsRealUser: boolean;
  /** True when there's any session at all (incl. anon). */
  viewerHasSession: boolean;
  /** Existing total of paid tips, in cents. */
  totalCents: number;
  /**
   * True when the host has a Stripe Connect account with charges
   * enabled. When false, online tipping isn't wired up and the section
   * collapses to a short explanatory note.
   */
  hostCanCollectTips: boolean;
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TipJar({
  eventId,
  viewerIsRealUser,
  viewerHasSession,
  totalCents,
  hostCanCollectTips,
}: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>('5');

  const cents = Math.round(Number(amount) * 100);
  const validAmount = Number.isFinite(cents) && cents >= MIN_TIP_CENTS && cents <= MAX_TIP_CENTS;

  if (!hostCanCollectTips) {
    // Host hasn't finished Stripe onboarding (or has disabled charges),
    // so we have nowhere to route the funds. Render a short note instead
    // of the form so the section doesn't look broken or unresponsive.
    return (
      <section className="border-border-base rounded-shape-sm border p-4">
        <header className="flex items-baseline justify-between">
          <h2 className="text-fg text-sm font-semibold">Tip the host</h2>
        </header>
        <p className="text-muted mt-1 text-xs">
          Online tipping isn&apos;t set up for this host yet. If you&apos;d like to leave something
          extra, ask them in person — they&apos;ll appreciate it!
        </p>
      </section>
    );
  }

  return (
    <section className="border-border-base rounded-shape-sm border p-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-fg text-sm font-semibold">Tip the host</h2>
        {totalCents > 0 && (
          <span className="text-muted text-xs">{formatUsd(totalCents)} tipped</span>
        )}
      </header>
      <p className="text-muted mt-1 text-xs">
        Optional — show appreciation. 100% goes to the host: PickupVB takes no fee on tips (only
        Stripe&apos;s card processing fee applies).
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-border-base bg-surface hover:bg-fg/5 mt-3 rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          Leave a tip
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((dollars) => (
              <button
                key={dollars}
                type="button"
                onClick={() => setAmount(String(dollars))}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                  amount === String(dollars)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border-base bg-surface hover:bg-fg/5'
                }`}
              >
                ${dollars}
              </button>
            ))}
            <label className="flex items-center gap-1 text-sm">
              <span className="text-muted">$</span>
              <input
                type="number"
                step="0.50"
                min={MIN_TIP_CENTS / 100}
                max={MAX_TIP_CENTS / 100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="border-border-base bg-surface w-20 rounded-md border px-2 py-1"
              />
            </label>
          </div>

          {!validAmount && (
            <p className="text-secondary text-xs">
              Tip must be between ${MIN_TIP_CENTS / 100} and ${MAX_TIP_CENTS / 100}.
            </p>
          )}

          {viewerHasSession ? (
            <form action={startTipCheckout.bind(null, eventId)} className="space-y-2">
              <input type="hidden" name="amount" value={amount} />
              <textarea
                name="message"
                rows={2}
                maxLength={280}
                placeholder="Optional note (visible to the host)"
                className="border-border-base bg-surface w-full rounded-md border p-2 text-sm"
              />
              <div className="flex items-center gap-2">
                <SubmitButton disabled={!validAmount} className={primaryButtonClass('md')}>
                  Tip {validAmount ? formatUsd(cents) : ''}
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-muted text-sm hover:underline"
                >
                  Cancel
                </button>
                {!viewerIsRealUser && (
                  <span className="text-muted text-xs">Using guest session</span>
                )}
              </div>
            </form>
          ) : (
            <form action={startGuestTipCheckout.bind(null, eventId)} className="space-y-2">
              <input type="hidden" name="amount" value={amount} />
              <input
                name="display_name"
                required
                maxLength={80}
                placeholder="Your name (shown to the host)"
                className="border-border-base bg-surface w-full rounded-md border p-2 text-sm"
              />
              <textarea
                name="message"
                rows={2}
                maxLength={280}
                placeholder="Optional note (visible to the host)"
                className="border-border-base bg-surface w-full rounded-md border p-2 text-sm"
              />
              <TurnstileWidget />
              <div className="flex items-center gap-2">
                <SubmitButton disabled={!validAmount} className={primaryButtonClass('md')}>
                  Tip {validAmount ? formatUsd(cents) : ''}
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-muted text-sm hover:underline"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
