'use client';

import { useState } from 'react';
import { TurnstileWidget } from '@/components/turnstile-widget';
import {
    startTipCheckout,
    startGuestTipCheckout,
} from '../tip-actions';
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
};

function formatUsd(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

export function TipJar({ eventId, viewerIsRealUser, viewerHasSession, totalCents }: Props) {
    const [open, setOpen] = useState(false);
    const [amount, setAmount] = useState<string>('5');

    const cents = Math.round(Number(amount) * 100);
    const validAmount =
        Number.isFinite(cents) && cents >= MIN_TIP_CENTS && cents <= MAX_TIP_CENTS;

    return (
        <section className="rounded-lg border border-border-base p-4">
            <header className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-fg">Tip the host</h2>
                {totalCents > 0 && (
                    <span className="text-xs text-muted">
                        {formatUsd(totalCents)} tipped
                    </span>
                )}
            </header>
            <p className="mt-1 text-xs text-muted">
                Optional — show appreciation. Tips go directly to the host.
            </p>

            {!open ? (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="mt-3 rounded-md border border-border-base bg-surface px-3 py-1.5 text-sm font-medium hover:bg-fg/5"
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
                                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${amount === String(dollars)
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
                                className="w-20 rounded-md border border-border-base bg-surface px-2 py-1"
                            />
                        </label>
                    </div>

                    {!validAmount && (
                        <p className="text-xs text-secondary">
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
                                className="w-full rounded-md border border-border-base bg-surface p-2 text-sm"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="submit"
                                    disabled={!validAmount}
                                    className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                >
                                    Tip {validAmount ? formatUsd(cents) : ''}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="text-sm text-muted hover:underline"
                                >
                                    Cancel
                                </button>
                                {!viewerIsRealUser && (
                                    <span className="text-xs text-muted">
                                        Using guest session
                                    </span>
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
                                className="w-full rounded-md border border-border-base bg-surface p-2 text-sm"
                            />
                            <textarea
                                name="message"
                                rows={2}
                                maxLength={280}
                                placeholder="Optional note (visible to the host)"
                                className="w-full rounded-md border border-border-base bg-surface p-2 text-sm"
                            />
                            <TurnstileWidget />
                            <div className="flex items-center gap-2">
                                <button
                                    type="submit"
                                    disabled={!validAmount}
                                    className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                >
                                    Tip {validAmount ? formatUsd(cents) : ''}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="text-sm text-muted hover:underline"
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
