'use client';

import type { CSSProperties } from 'react';
import { faults, MOON, SUN, type Puzzle } from '../puzzle';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

export function SunMark({ size }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="fd-sun">
      <circle cx="16" cy="16" r="11" />
    </svg>
  );
}

export function MoonMark({ size }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="fd-moon">
      <path d="M21 4.6A12 12 0 1 0 27.4 22 9.6 9.6 0 0 1 21 4.6z" />
    </svg>
  );
}

/** A sun and a moon side by side, for moments and the finished card. */
export function PairMark({ size }: { size?: number | string }) {
  return (
    <svg
      viewBox="0 0 64 32"
      width={size}
      height={typeof size === 'number' ? size / 2 : size}
      aria-hidden="true"
      className="fd-pair"
    >
      <circle className="fd-sun" cx="16" cy="16" r="11" />
      <path className="fd-moon" d="M53 4.6A12 12 0 1 0 59.4 22 9.6 9.6 0 0 1 53 4.6z" />
    </svg>
  );
}

/** The mark after a tap: empty, then sun, then moon, then empty again. */
export const nextMark = (v: number) => (v + 1) % 3;

const WORD = ['empty', 'sun', 'moon'];

/**
 * The board. Tap a square for a sun, again for a moon, again to clear it. Squares that came
 * filled in can't be changed. Marks that break a rule turn red. Read-only without `onCells` (the
 * TV, the results, anyone watching). `cells` are the player's marks; the puzzle's own are added.
 */
export function Board({
  puzzle,
  cells,
  onCells,
  solved = false,
  label,
  className,
}: {
  puzzle: Puzzle;
  cells: readonly number[];
  onCells?: (next: number[]) => void;
  solved?: boolean;
  label: string;
  className?: string;
}) {
  const { size } = puzzle;
  const board = puzzle.given.map((g, i) => g || cells[i] || 0);
  const bad = faults(puzzle, board);
  const signsAt = (i: number) =>
    puzzle.signs.flatMap((s) => {
      if (s.a !== i && s.b !== i) return [];
      const other = s.a === i ? s.b : s.a;
      const side =
        other === i - size
          ? 'above'
          : other === i + size
            ? 'below'
            : other === i - 1
              ? 'left'
              : 'right';
      return [`${s.same ? '=' : '×'} ${side}`];
    });

  const tap = (i: number) => {
    if (!onCells || puzzle.given[i]) return;
    const next = puzzle.given.map((g, k) => (g ? 0 : (cells[k] ?? 0)));
    next[i] = nextMark(next[i]!);
    onCells(next);
  };

  return (
    <div
      className={`fd-board${solved ? ' is-solved' : ''}${onCells ? ' is-live' : ''}${className ? ` ${className}` : ''}`}
      role="grid"
      aria-label={label}
      style={vars({ '--n': size })}
    >
      {board.map((v, i) => {
        const given = !!puzzle.given[i];
        const name = [
          `Row ${Math.floor(i / size) + 1}, column ${(i % size) + 1}`,
          ...signsAt(i),
        ].join(', ');
        return (
          <button
            key={i}
            type="button"
            data-cell={i}
            tabIndex={onCells && !given ? 0 : -1}
            disabled={!onCells || given}
            aria-label={`${name}: ${WORD[v]}${given ? ', given' : ''}`}
            className={`fd-cell${given ? ' is-given' : ''}${bad.has(i) ? ' is-bad' : ''}`}
            style={vars({ '--i': i })}
            onClick={() => tap(i)}
          >
            {v === SUN && <SunMark />}
            {v === MOON && <MoonMark />}
          </button>
        );
      })}
      <svg className="fd-ink" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {puzzle.signs.map((s) => {
          const r = Math.floor(s.a / size);
          const c = s.a % size;
          const across = s.b === s.a + 1;
          const x = across ? c + 1 : c + 0.5;
          const y = across ? r + 0.5 : r + 1;
          const k = 0.06;
          return (
            <g key={`${s.a}-${s.b}`} className="fd-sign">
              <circle cx={x} cy={y} r={0.13} />
              {s.same ? (
                <path d={`M${x - k} ${y - 0.035}h${2 * k}M${x - k} ${y + 0.035}h${2 * k}`} />
              ) : (
                <path
                  d={`M${x - k * 0.8} ${y - k * 0.8}l${1.6 * k} ${1.6 * k}M${x + k * 0.8} ${y - k * 0.8}l${-1.6 * k} ${1.6 * k}`}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
