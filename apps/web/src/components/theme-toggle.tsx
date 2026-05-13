'use client';

import { useTransition } from 'react';
import { setTheme } from '@/app/theme-actions';
import type { Theme } from '@/lib/theme';

export function ThemeToggle({ current }: { current: Theme }) {
    const [pending, start] = useTransition();

    function apply(next: Theme) {
        if (next === current) return;
        // Update the DOM immediately so the change feels instant; the server
        // action will persist the cookie (and profile) shortly after.
        document.documentElement.setAttribute('data-theme', next);
        start(() => setTheme(next));
    }

    return (
        <div
            role="group"
            aria-label="Theme"
            className="inline-flex rounded-md border border-border-base bg-surface p-0.5 text-xs"
        >
            <button
                type="button"
                aria-pressed={current === 'light'}
                disabled={pending}
                onClick={() => apply('light')}
                className={`rounded px-2 py-1 transition ${current === 'light'
                    ? 'bg-primary text-primary-fg'
                    : 'text-fg/70 hover:text-fg'
                    }`}
                title="Light theme"
            >
                ☀ Light
            </button>
            <button
                type="button"
                aria-pressed={current === 'dark'}
                disabled={pending}
                onClick={() => apply('dark')}
                className={`rounded px-2 py-1 transition ${current === 'dark'
                    ? 'bg-primary text-primary-fg'
                    : 'text-fg/70 hover:text-fg'
                    }`}
                title="Dark theme"
            >
                ☾ Dark
            </button>
        </div>
    );
}
