'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

type Mode = 'sign-in' | 'sign-up';

function friendlyError(message: string, mode: Mode): string {
    const m = message.toLowerCase();
    if (m.includes('invalid login credentials')) {
        return mode === 'sign-in'
            ? "We couldn't find an account with that email and password. Want to sign up instead?"
            : message;
    }
    if (m.includes('user already registered') || m.includes('already exists')) {
        return 'An account with that email already exists. Try signing in.';
    }
    if (m.includes('email not confirmed')) {
        return 'Please confirm your email first — check your inbox for the link.';
    }
    if (m.includes('password should be')) {
        return 'Password must be at least 8 characters.';
    }
    return message;
}

function LoginForm() {
    const router = useRouter();
    const params = useSearchParams();
    const initialMode: Mode = params.get('mode') === 'sign-up' ? 'sign-up' : 'sign-in';
    const [mode, setMode] = useState<Mode>(initialMode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    function switchMode(next: Mode) {
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
                setError(friendlyError(error.message, mode));
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
            setError(friendlyError(error.message, mode));
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

    async function signInWithGoogle() {
        setError(null);
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) setError(error.message);
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

            <div className="grid grid-cols-2 rounded-md border border-border-base p-1 text-sm">
                <button
                    type="button"
                    onClick={() => switchMode('sign-in')}
                    className={`rounded px-3 py-1.5 font-medium transition ${!signUp ? 'bg-primary text-white' : 'text-fg/70'
                        }`}
                >
                    Sign in
                </button>
                <button
                    type="button"
                    onClick={() => switchMode('sign-up')}
                    className={`rounded px-3 py-1.5 font-medium transition ${signUp ? 'bg-primary text-white' : 'text-fg/70'
                        }`}
                >
                    Sign up
                </button>
            </div>

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
                    {signUp && (
                        <span className="mt-1 block text-xs text-fg/60">
                            At least 8 characters.
                        </span>
                    )}
                </label>

                {error && (
                    <div
                        role="alert"
                        className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                    >
                        {error}
                    </div>
                )}
                {info && (
                    <div
                        role="status"
                        className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary"
                    >
                        {info}
                    </div>
                )}

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

            <button
                type="button"
                onClick={signInWithGoogle}
                className="w-full rounded-md border border-border-base px-4 py-2 font-medium hover:bg-fg/5"
            >
                Continue with Google
            </button>

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
