'use client';

import { setTheme, useTheme } from '@jackdaw/ui';

/**
 * Switches between the day and dark looks (games follow it) and remembers the choice, as a square
 * icon button for a top bar: a moon by day, a sun in the dark.
 */
export function ThemeButton({ className }: { className?: string }) {
  const dark = useTheme() === 'dark';
  return (
    <button
      type="button"
      className={className ? `jd-iconbtn ${className}` : 'jd-iconbtn'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to the day look' : 'Switch to the dark look'}
      title={dark ? 'Day look' : 'Dark look'}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

/** Day or dark as a two-way choice, for a settings list. */
export function ThemeChoice() {
  const look = useTheme();
  return (
    <div className="look-choice" role="radiogroup" aria-label="Look">
      {(['light', 'dark'] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={look === t}
          className="look-choice__opt"
          onClick={() => setTheme(t)}
        >
          {t === 'light' ? 'Day' : 'Dark'}
        </button>
      ))}
    </div>
  );
}
