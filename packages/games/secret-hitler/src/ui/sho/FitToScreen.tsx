'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Jackdaw: the decks and boards shrink, down to `min`, so the game page fits the screen under
 * the player tiles without scrolling (secret-hitler.online's page scrolls to reach the boards).
 * Below `min` the page scrolls as on the site. The TV fits its whole page instead.
 */
export function FitToScreen({ children, min = 0.45 }: { children: ReactNode; min?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.closest('.tv-game') || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const fit = () => {
      el.style.zoom = '1';
      const top = el.getBoundingClientRect().top + window.scrollY;
      const room = window.innerHeight - top - 12;
      const natural = el.offsetHeight;
      const next = natural > 0 ? String(Math.max(min, Math.min(1, room / natural))) : '1';
      el.style.zoom = next;
    };
    // Refit on the next frame, once whatever changed (an image loading, a row of tiles) has settled.
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    const ro = new ResizeObserver(later);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', later);
    fit();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', later);
    };
  }, [min]);
  return (
    <div ref={ref} style={{ display: 'inline-block' }}>
      {children}
    </div>
  );
}
