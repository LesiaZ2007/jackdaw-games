'use client';

import type { ScreenPlayer } from '@jackdaw/ui';
import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { NEUTRAL, type Armies, type Owner } from '../board';
import type { MapDef } from '../maps';
import './risk.css';

/** A player's colour as CSS (the neutral army is drawn in the rule colour). */
export function tintOf(pid: string, players: ScreenPlayer[]): string {
  if (pid === NEUTRAL) return 'var(--rule)';
  const p = players.find((x) => x.id === pid);
  return p ? `var(--tint-${p.avatar.tint}, var(--sable))` : 'var(--sable)';
}

interface View {
  /** Zoom (1 = the whole map). */
  k: number;
  /** Offset in map units. */
  x: number;
  y: number;
}

const MAX_ZOOM = 5;
const WHOLE: View = { k: 1, x: 0, y: 0 };

/** Keeps the map covering the frame: no panning off the edge. */
function clamp(v: View, w: number, h: number): View {
  const k = Math.min(MAX_ZOOM, Math.max(1, v.k));
  return {
    k,
    x: Math.min(0, Math.max(w * (1 - k), v.x)),
    y: Math.min(0, Math.max(h * (1 - k), v.y)),
  };
}

/** Zooms to `k` keeping the map point under `c` (in frame units) where it is. */
function zoomAt(v: View, k: number, c: [number, number]): View {
  const r = k / v.k;
  return { k, x: c[0] - r * (c[0] - v.x), y: c[1] - r * (c[1] - v.y) };
}

export interface RiskMapProps {
  map: MapDef;
  owner: Owner;
  armies: Armies;
  players: ScreenPlayer[];
  /** The territory picked (drawn raised). */
  selected?: string | null;
  /** Territories you can pick next (outlined); everything else dims while there are some. */
  targets?: string[];
  /** Armies staged on the phone but not sent yet, shown as "+n". */
  staged?: Record<string, number>;
  /** A territory to flash (the last battle's). */
  flash?: string | null;
  onPick?: (territory: string) => void;
  /** Pinch, drag and wheel zoom (phones and laptops); the TV shows the whole map. */
  zoomable?: boolean;
  /** Always show names (the TV, the results). */
  names?: boolean;
  className?: string;
}

/**
 * The board: territories washed in their continent's colour and edged inside with their
 * owner's, an army roundel on each, the coast inked over an engraved sea. Roundels and names keep
 * the same size on screen whatever the zoom.
 */
export function RiskMap({
  map,
  owner,
  armies,
  players,
  selected,
  targets = [],
  staged = {},
  flash,
  onPick,
  zoomable = false,
  names = false,
  className,
}: RiskMapProps) {
  const [w, h] = map.viewBox;
  const uid = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(WHOLE);
  // Screen pixels per map unit at zoom 1, for sizing roundels and names.
  const [ppu, setPpu] = useState(0.4);

  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setPpu(Math.min(r.width / w, r.height / h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  // Gestures: one finger drags, two pinch; a tap that barely moved still picks.
  const pointers = useRef(new Map<number, [number, number]>());
  const gesture = useRef<{ moved: boolean; start: View; pinch?: number; mid?: [number, number] }>({
    moved: false,
    start: WHOLE,
  });
  const toUnits = (cx: number, cy: number): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    const scale = Math.min(r.width / w, r.height / h);
    const ox = (r.width - w * scale) / 2;
    const oy = (r.height - h * scale) / 2;
    return [(cx - r.left - ox) / scale, (cy - r.top - oy) / scale];
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!zoomable) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const pts = [...pointers.current.values()];
    gesture.current = { moved: pointers.current.size > 1, start: view };
    if (pts.length === 2) {
      const [a, b] = pts as [[number, number], [number, number]];
      gesture.current.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
      gesture.current.mid = toUnits((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!zoomable || !prev) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length === 2 && g.pinch && g.mid) {
      const [a, b] = pts as [[number, number], [number, number]];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      g.moved = true;
      setView(clamp(zoomAt(g.start, g.start.k * (d / g.pinch), g.mid), w, h));
      return;
    }
    const [dx, dy] = [e.clientX - prev[0], e.clientY - prev[1]];
    if (!g.moved && Math.hypot(dx, dy) < 4) {
      pointers.current.set(e.pointerId, prev);
      return;
    }
    g.moved = true;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId) === false)
      e.currentTarget.setPointerCapture?.(e.pointerId);
    setView((v) => clamp({ ...v, x: v.x + dx / ppu, y: v.y + dy / ppu }, w, h));
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1)
      gesture.current = { ...gesture.current, start: view, pinch: undefined };
  };

  useEffect(() => {
    const el = svg.current;
    if (!el || !zoomable) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = toUnits(e.clientX, e.clientY);
      setView((v) => clamp(zoomAt(v, v.k * Math.exp(-e.deltaY / 400), c), w, h));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // toUnits reads the element directly; it doesn't need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomable, w, h]);

  const pick = (t: string) => {
    if (gesture.current.moved) return;
    onPick?.(t);
  };

  // Roundels about 11px across on screen, names about 11px tall, whatever the zoom.
  const px = ppu * view.k;
  const r = Math.max(6, 11 / px);
  const showNames = names || px > 1.15;
  const font = 11 / px;
  const tint = new Map(map.continents.map((c) => [c.id, c.tint]));
  const aiming = targets.length > 0;

  return (
    <div className={`rk-map ${zoomable ? 'rk-map--zoom' : ''} ${className ?? ''}`}>
      <svg
        ref={svg}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Map of ${map.name}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id={`${uid}-sea`} width="9" height="9" patternUnits="userSpaceOnUse">
            <path d="M0 4.5h9" className="rk-sea-line" />
          </pattern>
          {map.territories.map((t) => (
            <clipPath id={`${uid}-${t.id}`} key={t.id}>
              <path d={t.path} />
            </clipPath>
          ))}
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <rect width={w} height={h} className="rk-sea" />
          <rect width={w} height={h} fill={`url(#${uid}-sea)`} />
          <path d={map.sea} className="rk-coast-halo" />
          {map.lanes.map(([a, b]) => {
            const ta = map.territories.find((t) => t.id === a)!;
            const tb = map.territories.find((t) => t.id === b)!;
            return (
              <line
                key={`${a}-${b}`}
                x1={ta.label[0]}
                y1={ta.label[1]}
                x2={tb.label[0]}
                y2={tb.label[1]}
                className="rk-lane"
                strokeWidth={1.4 / view.k}
              />
            );
          })}
          {map.territories.map((t) => {
            const who = owner[t.id] ?? NEUTRAL;
            const isTarget = targets.includes(t.id);
            const cls = [
              'rk-terr',
              `rk-wash--${tint.get(t.continent)}`,
              t.id === selected && 'is-selected',
              isTarget && 'is-target',
              aiming && !isTarget && t.id !== selected && 'is-dim',
              t.id === flash && 'is-flash',
              onPick && 'is-pickable',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <g key={t.id} className={cls} onClick={() => pick(t.id)}>
                <title>{t.name}</title>
                <path d={t.path} className="rk-terr__land" />
                <path
                  d={t.path}
                  className="rk-terr__edge"
                  clipPath={`url(#${uid}-${t.id})`}
                  style={{ stroke: tintOf(who, players) }}
                  strokeWidth={9 / Math.sqrt(view.k)}
                />
                <path d={t.path} className="rk-terr__line" strokeWidth={0.8 / view.k} />
              </g>
            );
          })}
          <path d={map.sea} className="rk-coast" strokeWidth={2 / Math.sqrt(view.k)} />
          {map.territories.map((t) => {
            const who = owner[t.id] ?? NEUTRAL;
            const [x, y] = t.label;
            const extra = staged[t.id] ?? 0;
            return (
              <g key={t.id} className="rk-roundel" onClick={() => pick(t.id)}>
                <circle cx={x} cy={y} r={r} style={{ fill: tintOf(who, players) }} />
                <text x={x} y={y} dy="0.36em" fontSize={r * 1.15}>
                  {(armies[t.id] ?? 0) + extra}
                </text>
                {extra > 0 && (
                  <text x={x + r * 1.1} y={y - r * 0.9} className="rk-roundel__extra" fontSize={r}>
                    +{extra}
                  </text>
                )}
                {showNames && (
                  <text x={x} y={y + r + font * 1.1} className="rk-name" fontSize={font}>
                    {t.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {zoomable && view.k > 1.01 && (
        <button type="button" className="rk-map__whole" onClick={() => setView(WHOLE)}>
          Whole map
        </button>
      )}
    </div>
  );
}
