'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { AuthModeTabs } from './_components/auth-mode-tabs';
import { GoogleButton } from './_components/google-button';
import { friendlyAuthError, type AuthMode } from './_lib/friendly-error';
import { Alert } from '@/components/alert';

function LoginForm() {
    const router = useRouter();
    const params = useSearchParams();
    const initialMode: AuthMode = params.get('mode') === 'sign-up' ? 'sign-up' : 'sign-in';
    const [mode, setMode] = useState<AuthMode>(initialMode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    function switchMode(next: AuthMode) {
        setMode(next);
        setError(null);
        setInfo(null);
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setInfo(null);
        setLoading(true);
        const supabase = createSupabaseBrowserClient();

        if (mode === 'sign-in') {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            setLoading(false);
            if (error) {
                setError(friendlyAuthError(error.message, mode));
                return;
            }
            router.push('/events');
            router.refresh();
            return;
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        setLoading(false);
        if (error) {
            setError(friendlyAuthError(error.message, mode));
            return;
        }
        if (!data.session) {
            setInfo(
                `We sent a confirmation link to ${email}. Click it to finish setting up your account.`,
            );
            return;
        }
        router.push('/events');
        router.refresh();
    }

    const signUp = mode === 'sign-up';

    return (
        <div className="mx-auto max-w-sm space-y-6 py-8">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold">
                    {signUp ? 'Create your account' : 'Welcome back'}
                </h1>
                <p className="text-sm text-fg/70">
                    {signUp
                        ? 'Find pickup games, run tournaments, build your team.'
                        : 'Sign in to find games and manage your events.'}
                </p>
            </div>

            <AuthModeTabs mode={mode} onChange={switchMode} />

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
                <label className="block">
                    <span className="text-sm font-medium">Password</span>
                    <input
                        type="password"
                        autoComplete={signUp ? 'new-password' : 'current-password'}
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 w-full rounded-md border border-border-base px-3 py-2"
                    />
                    {signUp ? (
                        <span className="mt-1 block text-xs text-fg/60">
                            At least 8 characters.
                        </span>
                    ) : (
                        <Link
                            href="/forgot-password"
                            className="mt-1 block text-xs text-primary hover:underline"
                        >
                            Forgot password?
                        </Link>
                    )}
                </label>

                {error && <Alert variant="error">{error}</Alert>}
                {info && <Alert variant="info">{info}</Alert>}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                >
                    {loading ? 'Working…' : signUp ? 'Create account' : 'Sign in'}
                </button>
            </form>

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border-base" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-surface px-2 text-fg/50">Or</span>
                </div>
            </div>

            <GoogleButton />

            <p className="text-center text-sm text-fg/70">
                <Link href="/" className="hover:underline">
                    ← Back to home
                </Link>
            </p>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="mx-auto max-w-sm py-8">Loading…</div>}>
            <LoginForm />
        </Suspense>
    );
}
