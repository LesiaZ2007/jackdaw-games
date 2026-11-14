'use client';

import { prefersReducedMotion } from '@jackdaw/ui';

/**
 * Cards moving across the table: a card played flies from the hand or seat it left to the pile,
 * and cards drawn fly from the deck to the hand or seat that took them. Each is a short Web
 * Animation from where the card came from to where it now sits (nothing here changes layout), so
 * a missing element or reduced motion just means the card is already there. True when it flew.
 */
export function flyFrom(
  el: Element | null | undefined,
  from: DOMRect | null | undefined,
  opts: { delay?: number; duration?: number; spin?: number; fade?: boolean } = {},
): boolean {
  if (!el || !from || prefersReducedMotion() || typeof el.animate !== 'function') return false;
  const to = el.getBoundingClientRect();
  // The card's own width: a tilted card's bounding box is wider than the card.
  const w = (el as HTMLElement).offsetWidth || to.width;
  if (!w || !from.width) return false;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const s = from.width / w;
  const spin = opts.spin ?? 0;
  // The separate translate/scale/rotate properties, so a playable card's lift and a pile card's
  // tilt (both `transform`) stay put underneath and nothing jumps when the flight ends.
  el.animate(
    [
      {
        translate: `${dx}px ${dy}px`,
        scale: `${s}`,
        rotate: `${spin}deg`,
        opacity: opts.fade ? 0 : 1,
      },
      { opacity: 1, offset: 0.25 },
      { translate: '0px 0px', scale: '1', rotate: '0deg', opacity: 1 },
    ],
    {
      duration: opts.duration ?? 420,
      delay: opts.delay ?? 0,
      easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      fill: 'backwards',
    },
  );
  return true;
}

/** A short buzz on phones that have one (Android): your turn, or cards coming your way. */
export function buzz(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Not allowed before the first tap, and that's fine.
  }
}

/** A rect `w` px wide, card-shaped, centered on `el`: where a card leaves from or lands at a seat. */
export function cardRectAt(el: Element | null | undefined, w: number): DOMRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const h = w * 1.48;
  return new DOMRect(r.left + r.width / 2 - w / 2, r.top + r.height / 2 - h / 2, w, h);
}

/** A tilt a card keeps on the pile, the same on every screen: from the move that put it there. */
export function tiltOf(seq: number): number {
  return ((seq * 37) % 17) - 8;
}
