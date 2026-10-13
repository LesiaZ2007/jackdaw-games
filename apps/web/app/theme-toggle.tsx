'use client';

import { setTheme, useTheme } from '@jackdaw/ui';

/** Switches between the day and dark looks (games follow it) and remembers the choice. */
export function ThemeToggle({ className = 'home-link' }: { className?: string }) {
  const dark = useTheme() === 'dark';
  return (
    <button
      type="button"
      className={className}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-pressed={dark}
    >
      {dark ? 'Day look' : 'Dark look'}
    </button>
  );
}
