'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

type Mode = 'sign-in' | 'sign-up';

export default function LoginPage() {
    const router = useRouter();
    const [mode, setMode] = useState<Mode>('sign-in');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const supabase = createSupabaseBrowserClient();
        const { error } =
            mode === 'sign-in'
                ? await supabase.auth.signInWithPassword({ email, password })
                : await supabase.auth.signUp({ email, password });
        setLoading(false);
        if (error) {
            setError(error.message);
            return;
        }
        router.push('/events');
        router.refresh();
    }

    async function signInWithGoogle() {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
    }

    return (
        <div className="mx-auto max-w-sm space-y-6">
            <h1 className="text-2xl font-bold">
                {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
            </h1>
            <form onSubmit={onSubmit} className="space-y-4">
                <label className="block">
                    <span className="text-sm font-medium">Email</span>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 w-full rounded-md border border-net-900/20 px-3 py-2"
                    />
                </label>
                <label className="block">
                    <span className="text-sm font-medium">Password</span>
                    <input
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 w-full rounded-md border border-net-900/20 px-3 py-2"
                    />
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-court-600 px-4 py-2 font-medium text-white hover:bg-court-700 disabled:opacity-60"
                >
                    {loading ? '…' : mode === 'sign-in' ? 'Sign in' : 'Sign up'}
                </button>
            </form>
            <button
                type="button"
                onClick={signInWithGoogle}
                className="w-full rounded-md border border-net-900/20 px-4 py-2 font-medium hover:bg-net-900/5"
            >
                Continue with Google
            </button>
            <p className="text-center text-sm">
                {mode === 'sign-in' ? "Don't have an account?" : 'Already have one?'}{' '}
                <button
                    type="button"
                    className="text-court-600 hover:underline"
                    onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
                >
                    {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
                </button>
            </p>
        </div>
    );
}
