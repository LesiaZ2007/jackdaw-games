'use client';

import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { clashes, edges, ruledOut, type Mark } from '../marks';
import type { Puzzle } from '../puzzle';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** A hint on the board: squares it's about, ringed, and squares that explain it, shaded. */
export interface BoardHint {
  cells: readonly number[];
  area: readonly number[];
  mistake?: boolean;
}

/**
 * The king: a woodcut crown in flat ink. On the board it sits on a small cream roundel with an
 * ink ring so it reads on every fief; elsewhere (`roundel` off) it is the bare crown, which can
 * be `hollow` (an outline, for a king not yet placed) or `gold` (a finished set).
 */
export function KingMark({
  size,
  roundel = false,
  hollow = false,
  gold = false,
}: {
  size?: number | string;
  roundel?: boolean;
  hollow?: boolean;
  gold?: boolean;
}) {
  return (
    <svg
      viewBox={roundel ? '0 0 32 32' : '4 4.5 24 22'}
      width={size}
      height={size}
      aria-hidden="true"
      className={`kg-king${hollow ? ' is-hollow' : ''}${gold ? ' is-gold' : ''}`}
    >
      {roundel && <circle cx="16" cy="16" r="14.6" className="kg-king__disc" />}
      <path
        className="kg-king__body"
        d="M8 22.2 6.8 11.5 12 15.4 16 8.2 20 15.4 25.2 11.5 24 22.2zM8 23.6h16v2.2H8z"
      />
      <circle cx="6.8" cy="10" r="1.7" className="kg-king__body" />
      <circle cx="16" cy="6.8" r="1.7" className="kg-king__body" />
      <circle cx="25.2" cy="10" r="1.7" className="kg-king__body" />
    </svg>
  );
}

const name = (p: Puzzle, i: number) =>
  `Row ${Math.floor(i / p.size) + 1}, column ${(i % p.size) + 1}, color ${p.regions[i]! + 1}`;

/**
 * The printed board. Tap a square to cross it out, again for a king, again to clear it. Drag
 * from an empty square to cross out every empty square you pass (crossing from a crossed one
 * clears instead). Read-only without `onMarks` (the TV, results).
 */
export function Board({
  puzzle,
  marks,
  onMarks,
  auto = false,
  solved = false,
  hint,
  label,
  className,
}: {
  puzzle: Puzzle;
  marks: readonly Mark[];
  onMarks?: (next: Mark[]) => void;
  auto?: boolean;
  solved?: boolean;
  hint?: BoardHint | null;
  label: string;
  className?: string;
}) {
  const { size } = puzzle;
  const bad = clashes(puzzle, marks);
  const faint = auto ? ruledOut(puzzle, marks) : [];
  const drag = useRef<{ from: number; paint: Mark; moved: boolean; seen: Set<number> } | null>(
    null,
  );

  const cellAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell]');
    return el && e.currentTarget.contains(el) ? Number(el.dataset.cell) : null;
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!onMarks || e.button > 0) return;
    const at = cellAt(e);
    if (at === null) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { from: at, paint: marks[at] === 1 ? 0 : 1, moved: false, seen: new Set([at]) };
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !onMarks) return;
    const at = cellAt(e);
    if (at === null || d.seen.has(at)) return;
    const next = [...marks];
    const paint = (i: number) => {
      if (next[i] !== 2 && next[i] !== d.paint) next[i] = d.paint;
    };
    if (!d.moved) paint(d.from);
    d.moved = true;
    d.seen.add(at);
    paint(at);
    onMarks(next);
  };

  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !onMarks || d.moved) return;
    const at = cellAt(e) ?? d.from;
    if (at !== d.from) return;
    const next = [...marks];
    next[at] = ((next[at]! + 1) % 3) as Mark;
    onMarks(next);
  };

  return (
    <div
      className={`kg-board${solved ? ' is-solved' : ''}${onMarks ? ' is-live' : ''}${hint?.mistake ? ' is-mistake' : ''}${className ? ` ${className}` : ''}`}
      role="grid"
      aria-label={label}
      style={vars({ '--n': size })}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => (drag.current = null)}
    >
      {puzzle.regions.map((g, i) => {
        const e = edges(puzzle, i);
        const m = marks[i] ?? 0;
        const k = marks.slice(0, i).filter((x) => x === 2).length;
        return (
          <button
            key={i}
            type="button"
            data-cell={i}
            tabIndex={onMarks ? 0 : -1}
            disabled={!onMarks}
            aria-label={`${name(puzzle, i)}: ${m === 2 ? 'king' : m === 1 ? 'crossed out' : 'empty'}`}
            className={[
              'kg-cell',
              `kg-f${g % 10}`,
              e.t && 'kg-t',
              e.b && 'kg-b',
              e.l && 'kg-l',
              e.r && 'kg-r',
              bad.has(i) && 'is-bad',
              m === 0 && faint[i] && 'is-faint',
              hint?.cells.includes(i) && 'is-hint',
              hint?.area.includes(i) && 'is-area',
            ]
              .filter(Boolean)
              .join(' ')}
            style={vars({ '--fill': `var(--kg-r${g % 10})`, '--k': k })}
            onKeyDown={(ev) => {
              if (!onMarks || (ev.key !== 'Enter' && ev.key !== ' ')) return;
              ev.preventDefault();
              const next = [...marks];
              next[i] = ((next[i]! + 1) % 3) as Mark;
              onMarks(next);
            }}
          >
            {m === 2 ? (
              <KingMark size="82%" roundel />
            ) : m === 1 || (auto && faint[i]) ? (
              <span className="kg-cross" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
