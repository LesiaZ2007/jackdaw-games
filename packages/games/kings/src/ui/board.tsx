'use client';

import { useRef, type CSSProperties, type PointerEvent } from 'react';
import type { Puzzle } from '../puzzle';

/** What a square holds on the player's board: nothing, a cross they ruled out, or a king. */
export type Mark = 0 | 1 | 2;

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** A hint on the board: squares it's about, ringed, and squares that explain it, shaded. */
export interface BoardHint {
  cells: readonly number[];
  area: readonly number[];
  mistake?: boolean;
}

/** The king, in the house line style: a crown with a cross on top. */
export function KingMark({ size }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="kg-king">
      <path
        d="M16 3v6M13 6h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M5 13l4.5 3.5L16 10l6.5 6.5L27 13l-2.5 12h-17z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M7.5 28h17" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Squares a king rules out: its row, its column, its colour and the eight round it. Drawn faintly
 * when Auto-cross is on; never stored, so taking the king back clears them.
 */
export function ruledOut(p: Puzzle, marks: readonly Mark[]): boolean[] {
  const { size, regions } = p;
  const out = Array<boolean>(size * size).fill(false);
  marks.forEach((m, k) => {
    if (m !== 2) return;
    const kr = Math.floor(k / size);
    const kc = k % size;
    for (let i = 0; i < size * size; i++) {
      if (i === k) continue;
      const r = Math.floor(i / size);
      const c = i % size;
      if (
        r === kr ||
        c === kc ||
        regions[i] === regions[k] ||
        (Math.abs(r - kr) <= 1 && Math.abs(c - kc) <= 1)
      )
        out[i] = true;
    }
  });
  return out;
}

/** Kings that break a rule: sharing a row, column or colour, or touching another king. */
export function clashes(p: Puzzle, marks: readonly Mark[]): Set<number> {
  const { size, regions } = p;
  const kings = marks.flatMap((m, i) => (m === 2 ? [i] : []));
  const bad = new Set<number>();
  for (const a of kings)
    for (const b of kings) {
      if (a >= b) continue;
      const ar = Math.floor(a / size);
      const br = Math.floor(b / size);
      const ac = a % size;
      const bc = b % size;
      if (
        ar === br ||
        ac === bc ||
        regions[a] === regions[b] ||
        (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)
      ) {
        bad.add(a);
        bad.add(b);
      }
    }
  return bad;
}

/** Heavy ink on the sides of a square that border another colour (or the edge of the board). */
function edges(p: Puzzle, i: number) {
  const { size, regions } = p;
  const r = Math.floor(i / size);
  const c = i % size;
  const g = regions[i];
  return {
    t: r === 0 || regions[i - size] !== g,
    b: r === size - 1 || regions[i + size] !== g,
    l: c === 0 || regions[i - 1] !== g,
    r: c === size - 1 || regions[i + 1] !== g,
  };
}

const name = (p: Puzzle, i: number) =>
  `Row ${Math.floor(i / p.size) + 1}, column ${(i % p.size) + 1}, colour ${p.regions[i]! + 1}`;

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
            style={vars({ '--fill': `var(--kg-r${g})` })}
            onKeyDown={(ev) => {
              if (!onMarks || (ev.key !== 'Enter' && ev.key !== ' ')) return;
              ev.preventDefault();
              const next = [...marks];
              next[i] = ((next[i]! + 1) % 3) as Mark;
              onMarks(next);
            }}
          >
            {m === 2 ? (
              <KingMark size="62%" />
            ) : m === 1 || (auto && faint[i]) ? (
              <span className="kg-cross" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** A board with only the answer's kings on it, for the results. */
export function answerMarks(p: Puzzle, kings: readonly number[]): Mark[] {
  const out = Array<Mark>(p.size * p.size).fill(0);
  for (const k of kings) out[k] = 2;
  return out;
}
