'use client';

import { useId, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { pipOf, pointOf, type PlayedStep, type Position, type Side } from '../board';
import type { TurnLog } from '../rules';

/**
 * The tables: a folding walnut case with stringing inlaid along the frame and hinges on the bar,
 * a vellum field, and points printed in gules and azure with an engraved line inside each.
 * Checkers are turned ivory and ebony. Drawn as one SVG so it scales from a phone to a TV.
 *
 * The board turns to the viewer: their home board is always bottom right and their checkers
 * travel anticlockwise to it. A TV sees it from Ivory's side.
 */

/** A place on the board: an absolute point 'p1'..'p24', the bar, or borne off. */
export type LocKey = `p${number}` | 'bar' | 'off';

export interface Flight {
  side: Side;
  from: LocKey;
  to: LocKey;
  /** ms */
  delay: number;
}

export const VB_W = 960;
export const VB_H = 660;
const F = 22; // frame
const W = 64; // point width
const R = 29; // checker radius
const PH = 258; // point height
const MID = VB_H / 2;
const BAR_X = 436;
const TRAY_X = 902;
const RIGHT0 = 466;

export function locOf(side: Side, pip: number): LocKey {
  if (pip >= 25) return 'bar';
  if (pip <= 0) return 'off';
  return `p${pointOf(side, pip)}`;
}

/** The viewer-relative column (0..11, left to right) and row of a board point. */
function place(viewer: Side, point: number): { x: number; top: boolean } {
  const pip = pipOf(viewer, point);
  const top = pip > 12;
  const col = top ? pip - 13 : 12 - pip;
  const x = col < 6 ? F + col * W + W / 2 : RIGHT0 + (col - 6) * W + W / 2;
  return { x, top };
}

function stepFor(n: number, room: number): number {
  if (n <= 1) return 2 * R;
  return Math.min(2 * R, (room - 2 * R) / (n - 1));
}

/** Centre of the k-th checker (0 at the base) of a stack of n at a place. */
function slot(
  viewer: Side,
  key: LocKey,
  side: Side,
  k: number,
  n: number,
): { x: number; y: number } {
  if (key === 'bar') {
    const step = stepFor(Math.max(n, 1), 230);
    const down = side === viewer;
    return { x: BAR_X, y: down ? MID + 44 + k * step : MID - 44 - k * step };
  }
  if (key === 'off') {
    const down = side === viewer;
    return { x: TRAY_X, y: down ? VB_H - F - 12 - k * 16 : F + 12 + k * 16 };
  }
  const { x, top } = place(viewer, Number(key.slice(1)));
  const step = stepFor(Math.max(n, 1), PH);
  return { x, y: top ? F + R + k * step : VB_H - F - R - k * step };
}

function count(pos: Position, key: LocKey, side: Side): number {
  if (key === 'bar') return pos.bar[side];
  if (key === 'off') return pos.off[side];
  const v = pos.points[Number(key.slice(1)) - 1] ?? 0;
  return side === 0 ? Math.max(0, v) : Math.max(0, -v);
}

/** Who has checkers on a point. */
function owner(pos: Position, point: number): Side | null {
  const v = pos.points[point - 1] ?? 0;
  return v > 0 ? 0 : v < 0 ? 1 : null;
}

/** The checkers that moved in a turn, joined into one flight per checker, plus any it hit. */
export function flightsOf(entry: TurnLog | null): Flight[] {
  if (!entry || entry.kind !== 'move' || !entry.steps) return [];
  const side = entry.side;
  const chains: { from: number; to: number; hits: number[] }[] = [];
  for (const step of entry.steps) {
    const chain = chains.find((c) => c.to === step.from && c.to > 0);
    if (chain) chain.to = step.to;
    else chains.push({ from: step.from, to: step.to, hits: [] });
    if (step.hit) (chain ?? chains[chains.length - 1]!).hits.push(step.to);
  }
  const out: Flight[] = [];
  chains.forEach((c, i) => {
    out.push({ side, from: locOf(side, c.from), to: locOf(side, c.to), delay: i * 220 });
    for (const pip of c.hits) {
      out.push({
        side: side === 0 ? 1 : 0,
        from: locOf(side, pip),
        to: 'bar',
        delay: i * 220 + 260,
      });
    }
  });
  return out;
}

/** "24/18 13/11*": the turn in the usual notation, in the mover's own count. */
export function notation(steps: readonly PlayedStep[]): string {
  return steps
    .map((s) => `${s.from === 25 ? 'bar' : s.from}/${s.to === 0 ? 'off' : s.to}${s.hit ? '*' : ''}`)
    .join(' ');
}

export interface TablesProps {
  pos: Position;
  viewer: Side;
  /** The dice on the board and whose they are. */
  dice: readonly number[] | null;
  diceSide: Side | null;
  /** How many of `dice` (from the left) are spent. */
  spent?: number;
  /** Changes when the dice are rolled, so they tumble once. */
  rollKey?: string | number;
  cube: number;
  cubeOwner: Side | null;
  showCube: boolean;
  /** Places a checker may be picked up from. */
  movable?: ReadonlySet<LocKey>;
  selected?: LocKey | null;
  /** Places the selected checker may go. */
  targets?: ReadonlySet<LocKey>;
  onLoc?: (key: LocKey) => void;
  flights?: Flight[];
  /** Change to replay the flights. */
  flightKey?: string | number;
  /** Point numbers on the frame, in the viewer's count (TV). */
  numbers?: boolean;
  label: string;
  className?: string;
}

export function Tables({
  pos,
  viewer,
  dice,
  diceSide,
  spent = 0,
  rollKey,
  cube,
  cubeOwner,
  showCube,
  movable,
  selected,
  targets,
  onLoc,
  flights = [],
  flightKey,
  numbers,
  label,
  className,
}: TablesProps) {
  const uid = useId().replace(/:/g, '');
  const other: Side = viewer === 0 ? 1 : 0;

  // Flights land on the top checkers of their destination, the latest highest.
  const landing = new Map<string, Flight[]>();
  for (const f of flights) {
    const k = `${f.side}:${f.to}`;
    landing.set(k, [...(landing.get(k) ?? []), f]);
  }

  const checkers: ReactNode[] = [];
  const stack = (key: LocKey, side: Side) => {
    const n = count(pos, key, side);
    const flying = landing.get(`${side}:${key}`) ?? [];
    for (let k = 0; k < n; k++) {
      const { x, y } = slot(viewer, key, side, k, n);
      const fromTop = n - 1 - k;
      const flight = flying[flying.length - 1 - fromTop];
      let style: CSSProperties | undefined;
      if (flight) {
        const fromN = count(pos, flight.from, flight.side);
        const src = slot(viewer, flight.from, flight.side, fromN, fromN + 1);
        style = {
          '--fx': `${src.x - x}px`,
          '--fy': `${src.y - y}px`,
          '--fd': `${flight.delay}ms`,
        } as CSSProperties;
      }
      const top = k === n - 1;
      const lift = top && movable?.has(key) && side === viewer;
      const cls = [
        'bgm-ck',
        side === 0 ? 'bgm-ck--ivory' : 'bgm-ck--ebony',
        flight ? 'bgm-fly' : '',
        lift ? 'is-movable' : '',
        lift && selected === key ? 'is-picked' : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (key === 'off') {
        checkers.push(
          <rect
            key={`${key}-${side}-${k}-${flight ? flightKey : ''}`}
            className={cls}
            x={x - 30}
            y={y - 6.5}
            width={60}
            height={13}
            style={style}
          />,
        );
        continue;
      }
      checkers.push(
        <g
          key={`${key}-${side}-${k}-${flight ? flightKey : ''}`}
          className={cls}
          style={style}
          transform={`translate(${x} ${y})`}
        >
          <g className="bgm-ck__body">
            <circle r={R} className="bgm-ck__disc" />
            <circle r={R - 7} className="bgm-ck__ring" />
            <circle r={7} className="bgm-ck__boss" />
            {top && n > 5 && (
              <text className="bgm-ck__n" dy="0.36em">
                {n}
              </text>
            )}
          </g>
        </g>,
      );
    }
  };
  for (let p = 1; p <= 24; p++) {
    const who = owner(pos, p);
    if (who !== null) stack(`p${p}`, who);
  }
  stack('bar', viewer);
  stack('bar', other);
  stack('off', viewer);
  stack('off', other);

  // Points, the field and the frame.
  const points: ReactNode[] = [];
  const hits: ReactNode[] = [];
  const labels: ReactNode[] = [];
  for (let p = 1; p <= 24; p++) {
    const { x, top } = place(viewer, p);
    const pip = pipOf(viewer, p);
    const col = top ? pip - 13 : 12 - pip;
    const tint = (col + (top ? 1 : 0)) % 2 === 0 ? 'a' : 'b';
    const base = top ? F : VB_H - F;
    const apex = top ? F + PH : VB_H - F - PH;
    const inset = top ? 1 : -1;
    points.push(
      <g key={p} className={`bgm-pt bgm-pt--${tint}`}>
        <path d={`M${x - W / 2 + 2} ${base}L${x} ${apex}L${x + W / 2 - 2} ${base}Z`} />
        <path
          className="bgm-pt__line"
          d={`M${x - W / 2 + 12} ${base + inset * 2}L${x} ${apex - inset * 34}L${x + W / 2 - 12} ${base + inset * 2}`}
        />
      </g>,
    );
    const key: LocKey = `p${p}`;
    const target = targets?.has(key);
    if (target) {
      const n = count(pos, key, viewer);
      const spot = slot(viewer, key, viewer, Math.min(n, 4), Math.min(n, 4) + 1);
      points.push(
        <circle key={`t${p}`} className="bgm-target" cx={spot.x} cy={spot.y} r={R - 3} />,
      );
    }
    if (onLoc && (target || movable?.has(key))) {
      hits.push(
        <HitArea
          key={`h${p}`}
          x={x - W / 2}
          y={top ? F : MID + 2}
          w={W}
          h={MID - F - 2}
          label={`Point ${pip}${target ? ', move here' : ''}`}
          onPick={() => onLoc(key)}
        />,
      );
    }
    if (numbers) {
      labels.push(
        <text key={`n${p}`} className="bgm-num" x={x} y={top ? F - 6 : VB_H - 5}>
          {pip}
        </text>,
      );
    }
  }

  const offTarget = targets?.has('off');
  const shownDice = dice ?? [];
  const big = shownDice.length > 2 ? 52 : 66;
  const gap = shownDice.length > 2 ? 8 : 14;
  const diceX = diceSide === null ? 0 : diceSide === viewer ? RIGHT0 + 3 * W : F + 3 * W;
  const totalW = shownDice.length * big + (shownDice.length - 1) * gap;
  const cubeY = !showCube
    ? 0
    : cubeOwner === null
      ? MID
      : cubeOwner === viewer
        ? MID + 64
        : MID - 64;

  return (
    <svg
      className={`bgm-tables${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath id={`${uid}-field`}>
          <rect x={F} y={F} width={RIGHT0 + 6 * W - F} height={VB_H - 2 * F} />
        </clipPath>
      </defs>
      {/* The case */}
      <rect className="bgm-case" x={0} y={0} width={VB_W} height={VB_H} />
      <rect className="bgm-string" x={6} y={6} width={VB_W - 12} height={VB_H - 12} />
      {/* The field, each half */}
      <rect className="bgm-field" x={F} y={F} width={6 * W} height={VB_H - 2 * F} />
      <rect className="bgm-field" x={RIGHT0} y={F} width={6 * W} height={VB_H - 2 * F} />
      <g clipPath={`url(#${uid}-field)`}>{points}</g>
      {labels}
      {/* The bar, with its hinges and a lozenge inlay */}
      <rect
        className="bgm-bar"
        x={F + 6 * W}
        y={F}
        width={RIGHT0 - F - 6 * W}
        height={VB_H - 2 * F}
      />
      <rect className="bgm-hinge" x={BAR_X - 4} y={F + 70} width={8} height={46} />
      <rect className="bgm-hinge" x={BAR_X - 4} y={VB_H - F - 116} width={8} height={46} />
      <path className="bgm-inlay" d={`M${BAR_X} ${MID - 18}l12 18-12 18-12-18z`} />
      {/* The tray, for borne-off checkers and the cube */}
      <rect className="bgm-tray" x={TRAY_X - 36} y={F} width={72} height={VB_H - 2 * F} />
      <path className="bgm-tray__rule" d={`M${TRAY_X - 36} ${MID}h72`} />
      {offTarget && (
        <rect
          className="bgm-target bgm-target--tray"
          x={TRAY_X - 33}
          y={MID + 4}
          width={66}
          height={VB_H - F - MID - 7}
        />
      )}
      {showCube && (
        <g
          className={`bgm-cube${cubeOwner === null ? '' : ' is-owned'}`}
          transform={`translate(${TRAY_X} ${cubeY})`}
          key={`cube-${cube}-${cubeOwner}`}
        >
          <rect x={-26} y={-26} width={52} height={52} rx={6} />
          <text dy="0.36em">{cubeOwner === null && cube === 1 ? 64 : cube}</text>
        </g>
      )}
      {checkers}
      {shownDice.map((d, i) => (
        <Die
          key={`${rollKey ?? ''}-${i}`}
          value={d}
          x={diceX - totalW / 2 + i * (big + gap) + big / 2}
          y={MID}
          size={big}
          side={diceSide ?? 0}
          spent={i < spent}
          delay={i * 70}
        />
      ))}
      {hits}
      {onLoc && movable?.has('bar') && (
        <HitArea
          x={F + 6 * W}
          y={MID}
          w={RIGHT0 - F - 6 * W}
          h={MID - F}
          label="The bar"
          onPick={() => onLoc('bar')}
        />
      )}
      {onLoc && offTarget && (
        <HitArea
          x={TRAY_X - 36}
          y={MID}
          w={72}
          h={MID - F}
          label="Bear off"
          onPick={() => onLoc('off')}
        />
      )}
    </svg>
  );
}

function HitArea({
  x,
  y,
  w,
  h,
  label,
  onPick,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  onPick: () => void;
}) {
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick();
    }
  };
  return (
    <rect
      className="bgm-hit"
      x={x}
      y={y}
      width={w}
      height={h}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onPick}
      onKeyDown={key}
    />
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

/** A bone die for Ivory, an ebony one for Ebony. */
export function Die({
  value,
  x,
  y,
  size,
  side,
  spent,
  delay = 0,
}: {
  value: number;
  x: number;
  y: number;
  size: number;
  side: Side;
  spent?: boolean;
  delay?: number;
}) {
  const s = size / 2;
  const off = size * 0.27;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g
        className={`bgm-die bgm-die--${side === 0 ? 'ivory' : 'ebony'}${spent ? ' is-spent' : ''}`}
        style={{ '--dd': `${delay}ms` } as CSSProperties}
      >
        <rect x={-s} y={-s} width={size} height={size} rx={size * 0.16} />
        {(PIPS[value] ?? []).map(([px, py], i) => (
          <circle key={i} cx={px * off} cy={py * off} r={size * 0.085} />
        ))}
      </g>
    </g>
  );
}

/** A die on its own, for the dock and the log. */
export function DieIcon({ value, side, size = 28 }: { value: number; side: Side; size?: number }) {
  return (
    <svg
      className="bgm-dieicon"
      width={size}
      height={size}
      viewBox="-30 -30 60 60"
      aria-label={String(value)}
    >
      <Die value={value} x={0} y={0} size={54} side={side} />
    </svg>
  );
}

/** A checker on its own, for name plates. */
export function CheckerIcon({ side, size = 22 }: { side: Side; size?: number }) {
  return (
    <svg
      className="bgm-ckicon"
      width={size}
      height={size}
      viewBox="-32 -32 64 64"
      aria-hidden="true"
    >
      <g className={`bgm-ck ${side === 0 ? 'bgm-ck--ivory' : 'bgm-ck--ebony'}`}>
        <circle r={R} className="bgm-ck__disc" />
        <circle r={R - 7} className="bgm-ck__ring" />
        <circle r={7} className="bgm-ck__boss" />
      </g>
    </svg>
  );
}
