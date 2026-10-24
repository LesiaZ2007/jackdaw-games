'use client';

import { useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { pips } from '../board';
import type { Buildings, Roads } from '../build';
import { layout } from '../geometry';
import { YIELD, type Board, type Terrain } from '../types';
import { CITY, SETTLEMENT, resourceArt } from './glyphs';
import { seatColour } from './palette';
import './catan.css';

/**
 * The island, printed: tiles in their terrain inks with an engraved motif, shallows and an inked
 * seam round the coast, wooden piers to each harbour, cream number discs (red 6 and 8) with the
 * odds as dots, the robber, then everyone's roads, settlements and cities in their seat colours.
 * When a move is being chosen only the legal spots are drawn, and a tap snaps to the nearest one.
 */

export type Spot = { kind: 'road' | 'settlement' | 'city'; at: string };

export interface CatanBoardProps {
  board: Board;
  buildings: Buildings;
  roads: Roads;
  robber: number;
  seats: readonly string[];
  /** Corners that can be picked now (settlement or city spots). */
  corners?: string[];
  /** Edges that can be picked now (road spots). */
  edges?: string[];
  /** Tiles that can be picked now (where the robber may go). */
  tiles?: number[];
  ghost?: Spot | null;
  /** The ghost's seat colour. */
  ghostColour?: string;
  /** The last roll, with its count: paying tiles light up and cards fly to their buildings. */
  roll?: { total: number; seq: number } | null;
  /** Cards fly from each paying tile to its buildings (the TV). */
  flyers?: boolean;
  onCorner?: (id: string) => void;
  onEdge?: (id: string) => void;
  onTile?: (tile: number) => void;
  label: string;
  /** Sea round the island, in tile sides. */
  pad?: number;
  className?: string;
}

const TERRAIN_NAME: Record<Terrain, string> = {
  forest: 'Forest',
  pasture: 'Pasture',
  fields: 'Fields',
  hills: 'Hills',
  mountains: 'Mountains',
  desert: 'Desert',
};

/** How close (in CSS px) a tap must land to an offered spot to pick it. */
const SNAP_PX = 28;

/** The engraved motif on a 20-unit tile of pattern, in the terrain's own ink. */
function Motif({ t }: { t: Terrain }) {
  switch (t) {
    case 'forest':
      return (
        <>
          <g className="ctn-ink-fill">
            <path d="M5 2l3.6 7H6.6l3 5H.4l3-5H1.4z" />
            <path d="M15 11l3.2 6h-1.8l2.6 4H10l2.6-4h-1.8z" />
          </g>
          <path d="M5 2l1.6 3.2" className="ctn-hi" strokeWidth=".7" />
        </>
      );
    case 'pasture':
      return (
        <>
          <g className="ctn-ink-line" strokeWidth=".9" strokeLinecap="round">
            <path d="M2 8q1-3 2 0M3.2 8q.6-3.4 1.6-.4M12 17q1-3 2 0M13.2 17q.6-3.4 1.6-.4" />
          </g>
          <g className="ctn-sheep">
            <ellipse cx="14" cy="6" rx="2.3" ry="1.5" />
            <ellipse cx="4.5" cy="15.5" rx="2" ry="1.3" />
          </g>
          <g className="ctn-ink-fill">
            <circle cx="16.4" cy="5.6" r=".7" />
            <circle cx="6.6" cy="15.2" r=".6" />
          </g>
        </>
      );
    case 'fields':
      return (
        <g className="ctn-ink-line" strokeWidth=".9" strokeLinecap="round">
          <path d="M1 6l3-4M4 6l3-4M7 6l3-4M11 16l3-4M14 16l3-4M17 16l3-4" />
          <path d="M0 7h11M10 17h10" strokeWidth=".6" />
        </g>
      );
    case 'hills':
      return (
        <path
          className="ctn-ink-line"
          strokeWidth=".8"
          d="M0 4h20M0 10h20M0 16h20M5 4v6M15 4v6M10 10v6M0 10v6M20 10v6M5 16v4M15 16v4M10 0v4"
        />
      );
    case 'mountains':
      return (
        <>
          <path
            className="ctn-ink-line"
            strokeWidth="1"
            strokeLinejoin="round"
            d="M1 9l4-6 3 4 2-2 3 4M10 19l4-6 3 4 3-3"
          />
          <path d="M5 3l1.4 4" className="ctn-hi" strokeWidth=".8" />
        </>
      );
    case 'desert':
      return (
        <>
          <path
            className="ctn-ink-line"
            strokeWidth=".8"
            d="M0 8q5-4 10 0t10 0M-2 17q5-4 10 0t10 0"
          />
          <g className="ctn-ink-fill">
            <circle cx="4" cy="12" r=".5" />
            <circle cx="14" cy="3" r=".5" />
            <circle cx="16" cy="12" r=".4" />
          </g>
        </>
      );
  }
}

const TERRAINS: Terrain[] = ['forest', 'pasture', 'fields', 'hills', 'mountains', 'desert'];
const MOTIF = 0.32;

export function CatanBoard({
  board,
  buildings,
  roads,
  robber,
  seats,
  corners = [],
  edges = [],
  tiles = [],
  ghost,
  ghostColour,
  roll,
  flyers = false,
  onCorner,
  onEdge,
  onTile,
  label,
  pad = 1,
  className,
}: CatanBoardProps) {
  const L = layout(board.size);
  const uid = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const [bx0, by0, bx1, by1] = L.bounds;
  const vb = [bx0 - pad, by0 - pad, bx1 - bx0 + 2 * pad, by1 - by0 + 2 * pad];
  const corner = (id: string) => L.corners[id]!;
  const mid = (id: string) => {
    const e = L.edges[id]!;
    return { x: (corner(e.a).x + corner(e.b).x) / 2, y: (corner(e.a).y + corner(e.b).y) / 2 };
  };
  const poly = (i: number, k: number) => {
    const t = L.tiles[i]!;
    return t.corners
      .map((c) => {
        const p = corner(c);
        return `${(t.x + (p.x - t.x) * k).toFixed(3)},${(t.y + (p.y - t.y) * k).toFixed(3)}`;
      })
      .join(' ');
  };

  const pick = (x: number, y: number, scale: number) => {
    const near = (p: { x: number; y: number }) => Math.hypot(p.x - x, p.y - y) * scale;
    let best: { d: number; go: () => void } | null = null;
    const offer = (d: number, go: () => void) => {
      if (d <= SNAP_PX && (!best || d < best.d)) best = { d, go };
    };
    if (onCorner) for (const c of corners) offer(near(corner(c)), () => onCorner(c));
    if (onEdge) for (const e of edges) offer(near(mid(e)), () => onEdge(e));
    if (onTile)
      for (const i of tiles) {
        const d = Math.hypot(L.tiles[i]!.x - x, L.tiles[i]!.y - y);
        if (d < 0.86 && (!best || d * scale < best.d)) best = { d: d * scale, go: () => onTile(i) };
      }
    (best as { go: () => void } | null)?.go();
  };

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    pick(p.x, p.y, ctm.a);
  };

  const key = (go: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go();
    }
  };

  const tileName = (i: number) => {
    const t = board.tiles[i]!;
    return t.number ? `${TERRAIN_NAME[t.terrain]} ${t.number}` : TERRAIN_NAME[t.terrain];
  };
  const cornerName = (c: string) => corner(c).tiles.map(tileName).join(', ');

  const building = (x: number, y: number, colour: string, city: boolean, extra?: ReactNode) => (
    <g transform={`translate(${x} ${y}) scale(${1 / 36})`}>
      <path d={city ? CITY : SETTLEMENT} transform="translate(1.6 1.6)" className="ctn-shadow" />
      <path d={city ? CITY : SETTLEMENT} style={{ fill: colour }} className="ctn-build" />
      {city ? (
        <path d="M-7,1 h3 v3 h-3z M4,2 h3 v3 h-3z" className="ctn-window" />
      ) : (
        <path d="M-1.6,1.4 h3.2 v4.6 h-3.2z" className="ctn-window" />
      )}
      {extra}
    </g>
  );

  const road = (id: string, colour: string, cls = '') => {
    const e = L.edges[id]!;
    const a = corner(e.a);
    const b = corner(e.b);
    const t = 0.2;
    const p = [
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      b.x + (a.x - b.x) * t,
      b.y + (a.y - b.y) * t,
    ];
    return (
      <g key={id} className={cls}>
        <line x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} className="ctn-road-ink" />
        <line
          x1={p[0]}
          y1={p[1]}
          x2={p[2]}
          y2={p[3]}
          className="ctn-road"
          style={{ stroke: colour }}
        />
      </g>
    );
  };

  const paying =
    roll && roll.total !== 7
      ? board.tiles.flatMap((t, i) => (t.number === roll.total && i !== robber ? [i] : []))
      : [];

  return (
    <svg
      ref={svg}
      className={['ctn-board', className].filter(Boolean).join(' ')}
      viewBox={vb.join(' ')}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      onClick={onClick}
    >
      <defs>
        {TERRAINS.map((t) => (
          <pattern
            key={t}
            id={`${uid}-${t}`}
            patternUnits="userSpaceOnUse"
            width={MOTIF}
            height={MOTIF}
          >
            <g transform={`scale(${MOTIF / 20})`} className={`ctn-motif ctn-motif--${t}`}>
              <Motif t={t} />
            </g>
          </pattern>
        ))}
        <pattern id={`${uid}-sea`} patternUnits="userSpaceOnUse" width=".5" height=".28">
          <path d="M0 .14q.125-.09.25 0t.25 0" className="ctn-wave" />
        </pattern>
      </defs>
      <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} className="ctn-sea" />
      <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill={`url(#${uid}-sea)`} />
      {L.tiles.map((_, i) => (
        <polygon key={`sh${i}`} points={poly(i, 1.28)} className="ctn-shallow" />
      ))}
      {L.tiles.map((_, i) => (
        <polygon key={`se${i}`} points={poly(i, 1.03)} className="ctn-seam" />
      ))}

      {/* Harbours: two piers to the corners they serve, and the plaque out at sea. */}
      {board.harbours.map((h) => {
        const e = L.edges[h.edge]!;
        const m = mid(h.edge);
        const t = L.tiles[e.tiles[0]!]!;
        const len = Math.hypot(m.x - t.x, m.y - t.y);
        const at = { x: m.x + ((m.x - t.x) / len) * 0.62, y: m.y + ((m.y - t.y) / len) * 0.62 };
        const res = h.kind === 'any' ? null : h.kind;
        return (
          <g key={h.edge} className="ctn-harbour">
            {[e.a, e.b].map((c) => {
              const p = corner(c);
              const q = { x: p.x + (at.x - p.x) * 0.12, y: p.y + (at.y - p.y) * 0.12 };
              return (
                <g key={c}>
                  <line x1={at.x} y1={at.y} x2={q.x} y2={q.y} className="ctn-pier-ink" />
                  <line x1={at.x} y1={at.y} x2={q.x} y2={q.y} className="ctn-pier" />
                </g>
              );
            })}
            <circle cx={at.x} cy={at.y + 0.025} r=".27" className="ctn-shadow" />
            <circle
              cx={at.x}
              cy={at.y}
              r=".27"
              className={
                res ? `ctn-plaque ctn-fill--${YIELD_TERRAIN[res]}` : 'ctn-plaque ctn-plaque--any'
              }
            />
            {res ? (
              <>
                <g
                  transform={`translate(${at.x - 0.13} ${at.y - 0.2}) scale(${0.26 / 24})`}
                  className="ctn-plaque__art"
                >
                  {resourceArt(res)}
                </g>
                <text x={at.x} y={at.y + 0.19} className="ctn-plaque__ratio ctn-plaque__ratio--on">
                  2:1
                </text>
              </>
            ) : (
              <text x={at.x} y={at.y + 0.07} className="ctn-plaque__ratio">
                3:1
              </text>
            )}
            <title>{res ? `Harbour: 2 ${res} for 1` : 'Harbour: 3 of a kind for 1'}</title>
          </g>
        );
      })}

      {board.tiles.map((t, i) => (
        <g key={`t${i}`}>
          <polygon points={poly(i, 0.965)} className={`ctn-tile ctn-fill--${t.terrain}`} />
          <polygon points={poly(i, 0.965)} fill={`url(#${uid}-${t.terrain})`} />
          <title>{tileName(i)}</title>
        </g>
      ))}
      {paying.map((i) => (
        <polygon key={`p${roll!.seq}-${i}`} points={poly(i, 0.86)} className="ctn-paying" />
      ))}

      {board.tiles.map((t, i) => {
        if (!t.number) return null;
        const { x, y } = L.tiles[i]!;
        const red = t.number === 6 || t.number === 8;
        const n = pips(t.number);
        return (
          <g key={`n${i}`} className={red ? 'ctn-disc ctn-disc--red' : 'ctn-disc'}>
            <circle cx={x} cy={y + 0.03} r=".36" className="ctn-shadow" />
            <circle cx={x} cy={y} r=".35" className="ctn-disc__face" />
            <circle cx={x} cy={y} r=".3" className="ctn-disc__rule" />
            <text x={x} y={y + 0.1} className="ctn-disc__n">
              {t.number}
            </text>
            {Array.from({ length: n }, (_, k) => (
              <circle
                key={k}
                cx={x + (k - (n - 1) / 2) * 0.075}
                cy={y + 0.2}
                r=".026"
                className="ctn-disc__pip"
              />
            ))}
          </g>
        );
      })}

      {robber >= 0 && (
        <g
          transform={`translate(${L.tiles[robber]!.x + (board.tiles[robber]!.number ? 0.38 : 0)} ${L.tiles[robber]!.y - 0.02})`}
          className="ctn-robber"
        >
          <ellipse cx="0" cy=".3" rx=".2" ry=".06" className="ctn-shadow" />
          <path d="M-.17 .3 L-.1 -.02 Q-.18 -.12 -.08 -.18 A.12 .12 0 1 1 .08 -.18 Q.18 -.12 .1 -.02 L.17 .3 Z" />
          <title>The robber</title>
        </g>
      )}

      {Object.entries(roads).map(([id, owner]) => road(id, seatColour(owner, seats)))}
      {Object.entries(buildings).map(([c, b]) => (
        <g key={c}>{building(corner(c).x, corner(c).y, seatColour(b.owner, seats), b.city)}</g>
      ))}

      {/* What can be picked now. */}
      {tiles.map((i) => (
        <polygon
          key={`r${i}`}
          points={poly(i, 0.8)}
          className="ctn-spot ctn-spot--tile"
          role="button"
          tabIndex={0}
          aria-label={`Move the robber to ${tileName(i)}`}
          onKeyDown={onTile && key(() => onTile(i))}
        />
      ))}
      {edges.map((e) => {
        const m = mid(e);
        return ghost?.at === e ? null : (
          <circle
            key={`e${e}`}
            cx={m.x}
            cy={m.y}
            r=".15"
            className="ctn-spot"
            role="button"
            tabIndex={0}
            aria-label={`Road between ${cornerName(L.edges[e]!.a)} and ${cornerName(L.edges[e]!.b)}`}
            data-spot={e}
            onKeyDown={onEdge && key(() => onEdge(e))}
          />
        );
      })}
      {corners.map((c) =>
        ghost?.at === c ? null : (
          <circle
            key={`c${c}`}
            cx={corner(c).x}
            cy={corner(c).y}
            r=".2"
            className="ctn-spot"
            role="button"
            tabIndex={0}
            aria-label={`Build at ${cornerName(c)}`}
            data-spot={c}
            onKeyDown={onCorner && key(() => onCorner(c))}
          />
        ),
      )}
      {ghost && ghost.kind === 'road' && road(ghost.at, ghostColour ?? 'var(--rule)', 'ctn-ghost')}
      {ghost && ghost.kind !== 'road' && (
        <g className="ctn-ghost">
          <circle
            cx={corner(ghost.at).x}
            cy={corner(ghost.at).y}
            r=".36"
            className="ctn-ghost__ring"
          />
          {building(
            corner(ghost.at).x,
            corner(ghost.at).y,
            ghostColour ?? 'var(--rule)',
            ghost.kind === 'city',
          )}
        </g>
      )}

      {/* The roll paying out: a card flies from each paying tile to each building on it. */}
      {flyers &&
        roll &&
        paying.flatMap((i) =>
          L.tiles[i]!.corners.flatMap((c) => {
            const b = buildings[c];
            if (!b) return [];
            const t = L.tiles[i]!;
            const p = corner(c);
            return [
              <g
                key={`f${roll.seq}-${i}-${c}`}
                className="ctn-flyer"
                style={{
                  ['--fx' as string]: `${(p.x - t.x).toFixed(3)}px`,
                  ['--fy' as string]: `${(p.y - t.y).toFixed(3)}px`,
                }}
                transform={`translate(${t.x} ${t.y})`}
              >
                <g className="ctn-flyer__card">
                  <rect x="-.17" y="-.23" width=".34" height=".46" className="ctn-flyer__back" />
                  <rect
                    x="-.12"
                    y="-.17"
                    width=".24"
                    height=".24"
                    className={`ctn-fill--${board.tiles[i]!.terrain}`}
                  />
                  <text
                    y=".2"
                    className="ctn-flyer__n"
                    style={{ fill: seatColour(b.owner, seats) }}
                  >
                    +{b.city ? 2 : 1}
                  </text>
                </g>
              </g>,
            ];
          }),
        )}
    </svg>
  );
}

const YIELD_TERRAIN: Record<string, Terrain> = Object.fromEntries(
  Object.entries(YIELD).flatMap(([t, r]) => (r ? [[r, t as Terrain]] : [])),
);
