'use client';

import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { links, type Puzzle } from '../puzzle';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** A hint on the board: squares it's about, ringed, and squares that explain it, shaded. */
export interface BoardHint {
  cells: readonly number[];
  area: readonly number[];
  mistake?: boolean;
}

/** The bolt, for moments and the finished card. */
export function BoltMark({ size }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="zp-bolt">
      <path
        d="M18.5 2.5L7 18h7.5L12 29.5 25 13h-8z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The line after one tap or drag step onto `cell`, or null if it can't go there. The line starts
 * on 1 and stops at the last number; a square already on it cuts the line back to that square; a
 * free square next to its end, with no wall between, extends it.
 */
export function stepTo(p: Puzzle, adj: number[][], path: readonly number[], cell: number) {
  if (!path.length) return cell === p.dots[0] ? [cell] : null;
  const at = path.indexOf(cell);
  if (at >= 0) return at === path.length - 1 ? null : path.slice(0, at + 1);
  const end = path[path.length - 1]!;
  if (end === p.dots[p.dots.length - 1]) return null;
  return adj[end]!.includes(cell) ? [...path, cell] : null;
}

/**
 * The line walked from its end toward `cell` a square at a time, for drags quicker than one
 * square per move. Goes along the longer way first and stops where it can't go on.
 */
function walkTo(p: Puzzle, adj: number[][], path: number[], cell: number) {
  const { size } = p;
  let next = path;
  for (let guard = 0; guard < size * 2; guard++) {
    const end = next[next.length - 1]!;
    if (end === cell) break;
    const dr = Math.floor(cell / size) - Math.floor(end / size);
    const dc = (cell % size) - (end % size);
    const down = dr ? end + Math.sign(dr) * size : null;
    const across = dc ? end + Math.sign(dc) : null;
    const tries = Math.abs(dr) >= Math.abs(dc) ? [down, across] : [across, down];
    const grown = tries
      .filter((c): c is number => c !== null && !next.includes(c))
      .map((c) => stepTo(p, adj, next, c))
      .find((g) => g !== null);
    if (!grown) break;
    next = grown;
  }
  return next;
}

/** Numbers the line has reached out of order. */
export function outOfOrder(p: Puzzle, path: readonly number[]): Set<number> {
  const order = new Map(p.dots.map((c, k) => [c, k]));
  const bad = new Set<number>();
  let next = 0;
  for (const cell of path) {
    const k = order.get(cell);
    if (k === undefined) continue;
    if (k === next) next++;
    else bad.add(cell);
  }
  return bad;
}

/**
 * Per-puzzle inks from before the pen-and-page look. The board no longer uses them (every line is
 * the one pen ink, `--zp-ink-pen`); kept because the tests still pin their spread.
 */
const INKS: [line: string, trail: string][] = [
  ['#e0612a', '#f5d8c4'],
  ['#2f6fd6', '#d7e3f7'],
  ['#2e9a5b', '#d4ecdd'],
  ['#8a4fd1', '#e7dbf5'],
  ['#1b95a3', '#cfeaee'],
  ['#d6457f', '#f6d7e4'],
  ['#c98a12', '#f4e5c3'],
];

/** Each puzzle's ink, the same for everyone who sees it. */
export function inkOf(p: Puzzle): { line: string; trail: string } {
  let h = p.size;
  for (const c of p.dots) h = (h * 31 + c) >>> 0;
  for (const [a, b] of p.walls) h = (h * 31 + a * 97 + b) >>> 0;
  const [line, trail] = INKS[h % INKS.length]!;
  return { line, trail };
}

function wallLine(size: number, a: number, b: number) {
  const ra = Math.floor(a / size);
  const ca = a % size;
  if (b === a + 1) return { x1: ca + 1, y1: ra, x2: ca + 1, y2: ra + 1 };
  return { x1: ca, y1: ra + 1, x2: ca + 1, y2: ra + 1 };
}

function name(p: Puzzle, i: number, walls: string[]) {
  const dot = p.dots.indexOf(i);
  return [
    `Row ${Math.floor(i / p.size) + 1}, column ${(i % p.size) + 1}`,
    dot >= 0 ? `number ${dot + 1}` : null,
    ...walls,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * The board. Press on 1 and drag to draw the line; drag back along it to take steps back. Taps
 * work too: tap a square next to the line's end to add it, or press on a square of the line to cut
 * back to it. Read-only without `onPath` (the TV, the results, anyone watching).
 */
export function Board({
  puzzle,
  path,
  onPath,
  solved = false,
  hint,
  label,
  className,
}: {
  puzzle: Puzzle;
  path: readonly number[];
  onPath?: (next: number[]) => void;
  solved?: boolean;
  hint?: BoardHint | null;
  label: string;
  className?: string;
}) {
  const { size } = puzzle;
  const adj = links(puzzle);
  const on = new Set(path);
  const bad = outOfOrder(puzzle, path);
  // How many numbers the line has reached in order: those are "passed"; the next one is ringed.
  const order = new Map(puzzle.dots.map((c, k) => [c, k]));
  let reached = 0;
  for (const cell of path) if (order.get(cell) === reached) reached++;
  const drag = useRef<{ path: number[]; last: number } | null>(null);
  const [pen, setPen] = useState<{ x: number; y: number } | null>(null);
  const wallsOf = (i: number) => {
    const out: string[] = [];
    const r = Math.floor(i / size);
    const c = i % size;
    if (r > 0 && !adj[i]!.includes(i - size)) out.push('wall above');
    if (r < size - 1 && !adj[i]!.includes(i + size)) out.push('wall below');
    if (c > 0 && !adj[i]!.includes(i - 1)) out.push('wall left');
    if (c < size - 1 && !adj[i]!.includes(i + 1)) out.push('wall right');
    return out;
  };

  /** The pointer in board squares, (0, 0) at the top-left corner. */
  const spot = (e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const box = el.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left - el.clientLeft) / el.clientWidth) * size,
      y: ((e.clientY - box.top - el.clientTop) / el.clientHeight) * size,
    };
  };
  const cellOf = ({ x, y }: { x: number; y: number }) =>
    x < 0 || y < 0 || x >= size || y >= size ? null : Math.floor(y) * size + Math.floor(x);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!onPath || e.button > 0) return;
    const at = cellOf(spot(e));
    if (at === null) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const next = stepTo(puzzle, adj, path, at);
    drag.current = { path: next ?? [...path], last: at };
    if (next) onPath(next);
    setPen(spot(e));
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !onPath) return;
    const p = spot(e);
    setPen(p);
    const at = cellOf(p);
    if (at === null || at === d.last) return;
    const from = d.last;
    d.last = at;
    if (!d.path.length) return;
    const end = d.path[d.path.length - 1]!;
    const back = d.path.indexOf(at);
    let next = d.path;
    // Dragging onto the line only retraces its last step or two (two for a drag that skips a
    // square); running into older line just stops the finger, and nothing is lost.
    if (back >= 0) {
      const steps = d.path.length - 1 - back;
      if (steps > 0 && steps <= 2) next = d.path.slice(0, back + 1);
    } else if (from === end) {
      next = walkTo(puzzle, adj, d.path, at);
    } else {
      next = stepTo(puzzle, adj, d.path, at) ?? d.path;
    }
    if (next !== d.path) {
      d.path = next;
      onPath(next);
    }
  };

  const up = () => {
    drag.current = null;
    setPen(null);
  };

  const points = path.map((c) => `${(c % size) + 0.5},${Math.floor(c / size) + 0.5}`).join(' ');
  const end = path[path.length - 1];
  const ex = end === undefined ? 0 : (end % size) + 0.5;
  const ey = end === undefined ? 0 : Math.floor(end / size) + 0.5;
  // While drawing, the tip leans from the end square toward the pointer, as far as the edge of a
  // square the line could go to next, so the line moves with the finger rather than in jumps.
  let tip = { x: ex, y: ey };
  if (pen && end !== undefined) {
    const dx = pen.x - ex;
    const dy = pen.y - ey;
    const across = Math.abs(dx) >= Math.abs(dy);
    const d = across ? dx : dy;
    const toward = end + Math.sign(d) * (across ? 1 : size);
    if (d !== 0 && !on.has(toward) && stepTo(puzzle, adj, path, toward)) {
      const reach = Math.max(-0.5, Math.min(0.5, d));
      tip = across ? { x: ex + reach, y: ey } : { x: ex, y: ey + reach };
    }
  }

  // The nib points the way the line last went (or where the tip is leaning while drawing).
  const prev = path.length > 1 ? path[path.length - 2]! : undefined;
  let heading = { x: 1, y: 0 };
  if (tip.x !== ex || tip.y !== ey) heading = { x: tip.x - ex, y: tip.y - ey };
  else if (prev !== undefined)
    heading = { x: ex - ((prev % size) + 0.5), y: ey - (Math.floor(prev / size) + 0.5) };
  const angle = (Math.atan2(heading.y, heading.x) * 180) / Math.PI;

  const dot = (cell: number, k: number) => {
    const x = (cell % size) + 0.5;
    const y = Math.floor(cell / size) + 0.5;
    return (
      <g
        key={cell}
        className={`zp-dot${bad.has(cell) ? ' is-bad' : ''}${k < reached ? ' is-past' : ''}${k === reached ? ' is-next' : ''}`}
      >
        {k === reached && <circle className="zp-dot__ring" cx={x} cy={y} r={0.44} />}
        <circle className="zp-dot__disc" cx={x} cy={y} r={0.36} />
        <text x={x} y={y} dy="0.035em">
          {k + 1}
        </text>
      </g>
    );
  };

  return (
    <div
      className={`zp-board${solved ? ' is-solved' : ''}${onPath ? ' is-live' : ''}${hint?.mistake ? ' is-mistake' : ''}${className ? ` ${className}` : ''}`}
      role="grid"
      aria-label={label}
      style={vars({ '--n': size })}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {[...Array(size * size).keys()].map((i) => (
        <button
          key={i}
          type="button"
          data-cell={i}
          tabIndex={onPath ? 0 : -1}
          disabled={!onPath}
          aria-label={`${name(puzzle, i, wallsOf(i))}: ${i === end ? 'end of the line' : on.has(i) ? 'on the line' : 'empty'}`}
          className={`zp-cell${on.has(i) ? ' is-on' : ''}${hint?.cells.includes(i) ? ' is-hint' : ''}${hint?.area.includes(i) ? ' is-area' : ''}`}
          onKeyDown={(ev) => {
            if (!onPath || (ev.key !== 'Enter' && ev.key !== ' ')) return;
            ev.preventDefault();
            const next = stepTo(puzzle, adj, path, i);
            if (next) onPath(next);
          }}
        />
      ))}
      <svg className="zp-ink" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {puzzle.dots.map((cell, k) => (k < reached ? dot(cell, k) : null))}
        {(path.length > 1 || tip.x !== ex || tip.y !== ey) && (
          <>
            <polyline className="zp-line" points={`${points} ${tip.x},${tip.y}`} />
            <polyline className="zp-line-core" points={`${points} ${tip.x},${tip.y}`} />
          </>
        )}
        {puzzle.walls.map(([a, b]) => (
          <line key={`${a}-${b}`} className="zp-wall" {...wallLine(size, a, b)} />
        ))}
        {puzzle.dots.map((cell, k) => (k < reached ? null : dot(cell, k)))}
        {end !== undefined && (
          <g className="zp-nib" transform={`translate(${tip.x} ${tip.y}) rotate(${angle})`}>
            <path d="M0 0L-0.2 -0.14H-0.46Q-0.53 0 -0.46 0.14H-0.2Z" />
            <path className="zp-nib__slit" d="M-0.04 0H-0.32" />
          </g>
        )}
      </svg>
    </div>
  );
}
