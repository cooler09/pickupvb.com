'use client';

import { useTransition } from 'react';
import { setTheme } from '@/app/theme-actions';
import type { ThemePreference } from '@/lib/theme';

export function ThemeToggle({ current }: { current: ThemePreference }) {
  const [pending, start] = useTransition();

  function apply(next: ThemePreference) {
    if (next === current) return;
    // Update the DOM immediately so the change feels instant; the server
    // action persists the cookie (and profile, for explicit light/dark)
    // shortly after.
    const d = document.documentElement;
    d.setAttribute('data-theme-mode', next);
    if (next === 'system') {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      d.setAttribute('data-theme', dark ? 'dark' : 'light');
    } else {
      d.setAttribute('data-theme', next);
    }
    start(() => setTheme(next));
  }

  function btnClass(active: boolean) {
    return `rounded px-2 py-1 transition ${
      active ? 'bg-primary text-primary-fg' : 'text-fg/70 hover:text-fg'
    }`;
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className="border-border-base bg-md-surface-container inline-flex rounded-md border p-0.5 text-xs"
    >
      <button
        type="button"
        aria-pressed={current === 'light'}
        disabled={pending}
        onClick={() => apply('light')}
        className={btnClass(current === 'light')}
        title="Light theme"
      >
        ☀ Light
      </button>
      <button
        type="button"
        aria-pressed={current === 'dark'}
        disabled={pending}
        onClick={() => apply('dark')}
        className={btnClass(current === 'dark')}
        title="Dark theme"
      >
        ☾ Dark
      </button>
      <button
        type="button"
        aria-pressed={current === 'system'}
        disabled={pending}
        onClick={() => apply('system')}
        className={btnClass(current === 'system')}
        title="Follow system theme"
      >
        ⌂ System
      </button>
    </div>
  );
}
