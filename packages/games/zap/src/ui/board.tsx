'use client';

import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { links, type Puzzle } from '../puzzle';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

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
 * on 1; a square already on it cuts the line back to that square; a free square next to its end,
 * with no wall between, extends it.
 */
export function stepTo(p: Puzzle, adj: number[][], path: readonly number[], cell: number) {
  if (!path.length) return cell === p.dots[0] ? [cell] : null;
  const at = path.indexOf(cell);
  if (at >= 0) return at === path.length - 1 ? null : path.slice(0, at + 1);
  return adj[path[path.length - 1]!]!.includes(cell) ? [...path, cell] : null;
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
 * The board. Press on 1 and drag to draw the line; drag back over it to take steps back. Taps
 * work too: tap a square next to the line's end to add it, or a square on the line to cut back to
 * it. Read-only without `onPath` (the TV, the results, anyone watching).
 */
export function Board({
  puzzle,
  path,
  onPath,
  solved = false,
  label,
  className,
}: {
  puzzle: Puzzle;
  path: readonly number[];
  onPath?: (next: number[]) => void;
  solved?: boolean;
  label: string;
  className?: string;
}) {
  const { size } = puzzle;
  const adj = links(puzzle);
  const on = new Set(path);
  const bad = outOfOrder(puzzle, path);
  const drag = useRef<{ path: number[]; last: number } | null>(null);
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

  const cellAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell]');
    return el && e.currentTarget.contains(el) ? Number(el.dataset.cell) : null;
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!onPath || e.button > 0) return;
    const at = cellAt(e);
    if (at === null) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const next = stepTo(puzzle, adj, path, at);
    drag.current = { path: next ?? [...path], last: at };
    if (next) onPath(next);
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !onPath) return;
    const at = cellAt(e);
    if (at === null || at === d.last) return;
    d.last = at;
    let next = d.path;
    const end = next[next.length - 1];
    if (end === undefined) return;
    // A quick drag can skip squares: walk a straight run one square at a time.
    const sameRow = Math.floor(at / size) === Math.floor(end / size);
    const sameCol = at % size === end % size;
    const stepBy = sameRow ? Math.sign(at - end) : sameCol ? Math.sign(at - end) * size : 0;
    if (stepBy && !next.includes(at)) {
      for (let cell = end + stepBy; ; cell += stepBy) {
        const grown = stepTo(puzzle, adj, next, cell);
        if (!grown || grown.length < next.length) break;
        next = grown;
        if (cell === at) break;
      }
    } else if (next.length > 1 && at === next[next.length - 2]) {
      next = next.slice(0, -1);
    } else {
      next = stepTo(puzzle, adj, next, at) ?? next;
    }
    if (next !== d.path) {
      d.path = next;
      onPath(next);
    }
  };

  const points = path.map((c) => `${(c % size) + 0.5},${Math.floor(c / size) + 0.5}`).join(' ');
  const end = path[path.length - 1];

  return (
    <div
      className={`zp-board${solved ? ' is-solved' : ''}${onPath ? ' is-live' : ''}${className ? ` ${className}` : ''}`}
      role="grid"
      aria-label={label}
      style={vars({ '--n': size })}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      {[...Array(size * size).keys()].map((i) => (
        <button
          key={i}
          type="button"
          data-cell={i}
          tabIndex={onPath ? 0 : -1}
          disabled={!onPath}
          aria-label={`${name(puzzle, i, wallsOf(i))}: ${i === end ? 'end of the line' : on.has(i) ? 'on the line' : 'empty'}`}
          className={`zp-cell${on.has(i) ? ' is-on' : ''}`}
          onKeyDown={(ev) => {
            if (!onPath || (ev.key !== 'Enter' && ev.key !== ' ')) return;
            ev.preventDefault();
            const next = stepTo(puzzle, adj, path, i);
            if (next) onPath(next);
          }}
        />
      ))}
      <svg className="zp-ink" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {path.length > 1 && <polyline className="zp-line" points={points} />}
        {end !== undefined && (
          <circle
            className="zp-head"
            cx={(end % size) + 0.5}
            cy={Math.floor(end / size) + 0.5}
            r={0.22}
          />
        )}
        {puzzle.walls.map(([a, b]) => (
          <line key={`${a}-${b}`} className="zp-wall" {...wallLine(size, a, b)} />
        ))}
        {puzzle.dots.map((cell, k) => {
          const x = (cell % size) + 0.5;
          const y = Math.floor(cell / size) + 0.5;
          return (
            <g key={cell} className={`zp-dot${bad.has(cell) ? ' is-bad' : ''}`}>
              <circle cx={x} cy={y} r={0.33} />
              <text x={x} y={y} dy="0.035em">
                {k + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
