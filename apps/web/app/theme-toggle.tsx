'use client';

import { useEffect, useState } from 'react';

/** Switches between the day and dark looks and remembers the choice on this device. */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const set = document.documentElement.dataset.theme;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the theme is only known in the browser
    setDark(set ? set === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('jackdaw:theme', next ? 'dark' : 'light');
    } catch {
      // private mode: the choice just won't be remembered
    }
  }

  return (
    <button type="button" className="home-link" onClick={toggle} aria-pressed={dark ?? undefined}>
      {dark ? 'Day look' : 'Dark look'}
    </button>
  );
}
