'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        setLoading(false);
        if (error) {
            setError(error.message);
            return;
        }
        setSent(true);
    }

    return (
        <div className="mx-auto max-w-sm space-y-6 py-8">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold">Reset your password</h1>
                <p className="text-sm text-fg/70">
                    Enter the email associated with your account and we&apos;ll send you a link to
                    set a new password.
                </p>
            </div>

            {sent ? (
                <div
                    role="status"
                    className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary"
                >
                    If an account exists for {email}, a reset link is on the way. Check your
                    inbox (and spam folder).
                </div>
            ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                    <label className="block">
                        <span className="text-sm font-medium">Email</span>
                        <input
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 w-full rounded-md border border-border-base px-3 py-2"
                        />
                    </label>

                    {error && (
                        <div
                            role="alert"
                            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                        >
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                    >
                        {loading ? 'Sending…' : 'Send reset link'}
                    </button>
                </form>
            )}

            <p className="text-center text-sm text-fg/70">
                <Link href="/login" className="hover:underline">
                    ← Back to sign in
                </Link>
            </p>
        </div>
    );
}
