'use client';

import type { CSSProperties, ReactNode } from 'react';
import { BirdMark } from '@jackdaw/ui';
import type { Pick } from '../rules';
import './ring.css';

export const THROW_NAME: Record<Pick, string> = {
  rock: 'Rock',
  paper: 'Paper',
  scissors: 'Scissors',
};

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** The three throws, in the house line style (64×64), drawn to sit on a disc. */
const GLYPH: Record<Pick, ReactNode> = {
  rock: (
    <g {...line}>
      <path d="M9 44c-2-8 2-17 9-22 4-7 12-10 19-8 9 1 17 8 19 17 2 8-1 15-8 18-10 4-30 4-39-5z" />
      <path d="M17 40c6 1 11 4 14 9M37 15c-1 5 1 9 6 12" strokeWidth="2.8" />
    </g>
  ),
  paper: (
    <g {...line}>
      <path d="M17 7h21l10 10v40H17z" />
      <path d="M38 7v10h10M24 28h17M24 36h17M24 44h11" strokeWidth="3" />
    </g>
  ),
  scissors: (
    <g {...line}>
      <circle cx="17" cy="45" r="7" />
      <circle cx="17" cy="19" r="7" />
      <path d="M23 41L55 18M23 23l32 23" />
      <circle cx="35" cy="32" r="1.8" fill="currentColor" />
    </g>
  ),
};

export type DiscOutcome = 'win' | 'loss' | 'draw';

/**
 * A throw as a printed punch-out disc: rock is sable with a cream glyph, paper is cream with an
 * ink glyph and rule, scissors is gules with a cream glyph. Face down (or with no throw given) it
 * shows the sable back with the jackdaw. Turning `up` flips it over (a CSS 3D turn).
 * The size is `--d` (set by the parent's CSS, or pass `size` in px or any CSS length).
 */
export function ThrowDisc({
  pick,
  up = true,
  size,
  outcome,
  selected,
  className,
}: {
  pick?: Pick | null;
  up?: boolean;
  size?: number | string;
  outcome?: DiscOutcome | null;
  selected?: boolean;
  className?: string;
}) {
  const down = !up || !pick;
  const cls = [
    'rps-disc',
    pick && `rps-disc--${pick}`,
    down && 'is-down',
    outcome && `rps-disc--${outcome}`,
    selected && 'is-selected',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const style =
    size === undefined
      ? undefined
      : ({ '--d': typeof size === 'number' ? `${size}px` : size } as CSSProperties);
  return (
    <span className={cls} style={style} aria-hidden="true">
      <span className="rps-disc__in">
        {pick && (
          <span className="rps-disc__face rps-disc__front">
            <svg viewBox="0 0 64 64" focusable="false">
              {GLYPH[pick]}
            </svg>
          </span>
        )}
        <span className="rps-disc__face rps-disc__back">
          <BirdMark weight={3} />
        </span>
      </span>
    </span>
  );
}
