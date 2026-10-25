'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { NEUTRAL, type Armies, type Owner } from '../board';
import type { MapDef } from '../maps';
import { armyColour } from './armies';
import { LandDecor, SeaDecor } from './decor';
import './risk.css';

/** What's in the frame: the map point at its centre, and the zoom (1 = the whole map fits). */
interface View {
  cx: number;
  cy: number;
  z: number;
}

const MAX_ZOOM = 8;

export interface RiskMapProps {
  map: MapDef;
  owner: Owner;
  armies: Armies;
  /** The players in seat order: each seat's armies have their own colour. */
  seats: readonly string[];
  /** The territory picked (drawn raised). */
  selected?: string | null;
  /** Territories you can pick next (outlined); everything else dims while there are some. */
  targets?: string[];
  /** Armies staged on the phone but not sent yet, shown as "+n". */
  staged?: Record<string, number>;
  /** A territory to flash (the last battle's). */
  flash?: string | null;
  onPick?: (territory: string) => void;
  /**
   * Pinch, drag and wheel zoom (phones and laptops). It opens filling the frame (on a portrait
   * phone you pan sideways); "Whole map" shows all of it. Without it, the whole map always fits.
   */
  zoomable?: boolean;
  /**
   * Fog of war: territories missing from `owner` are out of sight, drawn as a hatched mist with no
   * army roundel (their names still show).
   */
  fog?: boolean;
  /** Always show names (the TV, the results). */
  names?: boolean;
  /** Roundels this many times their phone size (the TV, seen from the sofa); names grow less. */
  scale?: number;
  className?: string;
}

/** "Northwest Territory" on two lines, so long names don't run into their neighbours. */
function nameLines(name: string): string[] {
  const words = name.split(' ');
  if (name.length < 11 || words.length < 2) return [name];
  let best = 1;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    const was = Math.max(words.slice(0, best).join(' ').length, words.slice(best).join(' ').length);
    if (Math.max(a, b) < was) best = i;
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/**
 * The board: every territory filled with its owner's army colour, an army roundel on each, each
 * continent ruled round in a heavier double line with its name lettered in the sea, the coast
 * inked over an engraved sea with the cartographer's ornaments. Roundels and names keep the same
 * size on screen whatever the zoom.
 */
export function RiskMap({
  map,
  owner,
  armies,
  seats,
  selected,
  targets = [],
  staged = {},
  flash,
  onPick,
  zoomable = false,
  fog = false,
  names = false,
  scale = 1,
  className,
}: RiskMapProps) {
  const [w, h] = map.viewBox;
  const uid = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  // The frame's size in pixels (measured), and pixels per map unit when the whole map fits.
  const [frame, setFrame] = useState<[number, number]>([w, h]);
  const base = Math.min(frame[0] / w, frame[1] / h);
  const cover = Math.min(2.4, Math.max(frame[0] / w, frame[1] / h) / base);
  const [view, setView] = useState<View | null>(null);

  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setFrame([r.width, r.height]);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Keeps the map in the frame: no panning past its edges, zoom between "fits" and 8×. */
  const clamp = (v: View): View => {
    const z = Math.min(MAX_ZOOM, Math.max(1, v.z));
    const [vw, vh] = [frame[0] / (base * z), frame[1] / (base * z)];
    const fit = (c: number, span: number, size: number) =>
      span >= size ? size / 2 : Math.min(size - span / 2, Math.max(span / 2, c));
    return { z, cx: fit(v.cx, vw, w), cy: fit(v.cy, vh, h) };
  };
  const shown = clamp(view ?? { cx: w / 2, cy: h / 2, z: zoomable ? cover : 1 });
  const px = base * shown.z;
  const [vw, vh] = [frame[0] / px, frame[1] / px];
  const [x0, y0] = [shown.cx - vw / 2, shown.cy - vh / 2];

  /** The map point under a spot on screen. */
  const toUnits = (clientX: number, clientY: number): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [x0 + (clientX - r.left) / px, y0 + (clientY - r.top) / px];
  };
  /** Zoom to `z` keeping the map point under the screen spot where it is. */
  const zoomTo = (z: number, clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    const [ux, uy] = toUnits(clientX, clientY);
    const p2 = base * z;
    const [sx, sy] = [clientX - r.left, clientY - r.top];
    return clamp({ z, cx: ux - (sx - frame[0] / 2) / p2, cy: uy - (sy - frame[1] / 2) / p2 });
  };

  // Gestures: one finger drags, two pinch; a tap that barely moved still picks.
  const pointers = useRef(new Map<number, [number, number]>());
  const gesture = useRef<{ moved: boolean; pinch?: number; z?: number }>({ moved: false });

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!zoomable) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const pts = [...pointers.current.values()];
    gesture.current = { moved: pts.length > 1 };
    if (pts.length === 2) {
      const [a, b] = pts as [[number, number], [number, number]];
      gesture.current.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
      gesture.current.z = shown.z;
    }
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!zoomable || !prev) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length === 2 && g.pinch && g.z) {
      const [a, b] = pts as [[number, number], [number, number]];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      setView(zoomTo(g.z * (d / g.pinch), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
      return;
    }
    const [dx, dy] = [e.clientX - prev[0], e.clientY - prev[1]];
    if (!g.moved && Math.hypot(dx, dy) < 6) {
      pointers.current.set(e.pointerId, prev);
      return;
    }
    g.moved = true;
    setView(clamp({ ...shown, cx: shown.cx - dx / px, cy: shown.cy - dy / px }));
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  };

  // Wheel zoom needs a non-passive listener; keep the latest zoom function in a ref.
  const wheelZoom = useRef(zoomTo);
  useLayoutEffect(() => {
    wheelZoom.current = zoomTo;
  });
  useEffect(() => {
    const el = svg.current;
    if (!el || !zoomable) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        const z = (v?.z ?? cover) * Math.exp(-e.deltaY / 400);
        return wheelZoom.current(z, e.clientX, e.clientY);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomable, cover]);

  // Keep the picked territory in the frame (it can be picked off-screen from the dock's names).
  const label = map.territories.find((t) => t.id === selected)?.label;
  const offscreen =
    !!label &&
    (label[0] < x0 + vw * 0.1 ||
      label[0] > x0 + vw * 0.9 ||
      label[1] < y0 + vh * 0.1 ||
      label[1] > y0 + vh * 0.9);
  // Adjusted while rendering (React's pattern for "a prop changed"), once per pick.
  const [followed, setFollowed] = useState<string | null>(null);
  if ((selected ?? null) !== followed) {
    setFollowed(selected ?? null);
    if (offscreen && label) setView({ cx: label[0], cy: label[1], z: shown.z });
  }

  const pick = (t: string) => {
    if (gesture.current.moved) return;
    onPick?.(t);
  };

  // Roundels about 22px across on screen, names about 11px tall, whatever the zoom. On the TV
  // the roundels grow with `scale` but the names only a little, so they don't run together.
  const r = (11 * scale) / px;
  const showNames = names || px > 1.15;
  const font = (11 * (1 + (scale - 1) * 0.35)) / px;
  const colour = (pid: string) => armyColour(pid, seats);
  const aiming = targets.length > 0;

  return (
    <div className={`rk-map ${zoomable ? 'rk-map--zoom' : ''} ${className ?? ''}`}>
      <svg
        ref={svg}
        viewBox={`${x0} ${y0} ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
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
          {fog && (
            <pattern
              id={`${uid}-fog`}
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-38)"
            >
              <path d="M0 1.2h5" className="rk-fog-line" />
            </pattern>
          )}
          {map.territories.map((t) => (
            <clipPath id={`${uid}-${t.id}`} key={t.id}>
              <path d={t.path} />
            </clipPath>
          ))}
        </defs>
        <rect x={-w} y={-h} width={3 * w} height={3 * h} className="rk-sea" />
        <rect x={-w} y={-h} width={3 * w} height={3 * h} fill={`url(#${uid}-sea)`} />
        <path d={map.sea} className="rk-coast-halo" strokeWidth={14 / Math.sqrt(px * 2.5)} />
        <SeaDecor map={map} />
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
              strokeWidth={1.4 / px}
              strokeDasharray={`${4 / px} ${4 / px}`}
            />
          );
        })}
        {map.territories.map((t) => {
          const hidden = fog && !(t.id in owner);
          const who = owner[t.id] ?? NEUTRAL;
          const isTarget = targets.includes(t.id);
          const cls = [
            'rk-terr',
            hidden && 'is-fog',
            t.id === selected && 'is-selected',
            isTarget && 'is-target',
            aiming && !isTarget && t.id !== selected && 'is-dim',
            t.id === flash && 'is-flash',
            onPick && 'is-pickable',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <g
              key={t.id}
              className={cls}
              data-t={t.id}
              data-owner={hidden ? 'fog' : who}
              style={{ '--rk-own': colour(who) } as CSSProperties}
              onClick={() => pick(t.id)}
            >
              <title>{t.name}</title>
              <path d={t.path} className="rk-terr__land" />
              {hidden && <path d={t.path} className="rk-terr__fog" fill={`url(#${uid}-fog)`} />}
              <path
                d={t.path}
                className="rk-terr__edge"
                clipPath={`url(#${uid}-${t.id})`}
                strokeWidth={Math.max(3, 6 / px)}
              />
              <path
                d={t.path}
                className="rk-terr__line"
                strokeWidth={(isTarget || t.id === selected ? 2.4 : 0.8) / px}
              />
            </g>
          );
        })}
        {Object.entries(map.regions ?? {}).map(([id, d]) => (
          <g key={id} className="rk-region">
            <path d={d} className="rk-region__outer" strokeWidth={3.4 / Math.sqrt(px)} />
            <path d={d} className="rk-region__inner" strokeWidth={1.1 / Math.sqrt(px)} />
          </g>
        ))}
        <LandDecor map={map} />
        <path d={map.sea} className="rk-coast" strokeWidth={1.8 / Math.sqrt(px)} />
        {map.territories.map((t) => {
          const who = owner[t.id] ?? NEUTRAL;
          const [x, y] = t.label;
          const extra = staged[t.id] ?? 0;
          // Out of sight: no roundel, only the name lettered faintly over the mist.
          if (fog && !(t.id in owner))
            return showNames ? (
              <g key={t.id} className="rk-roundel is-fog" onClick={() => pick(t.id)}>
                <text x={x} y={y} className="rk-name" fontSize={font}>
                  {nameLines(t.name).map((line, i) => (
                    <tspan key={i} x={x} dy={i ? '1.05em' : '0.36em'}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            ) : null;
          return (
            <g key={t.id} className="rk-roundel" data-roundel={t.id} onClick={() => pick(t.id)}>
              <circle cx={x} cy={y} r={r} style={{ fill: colour(who) }} />
              <text x={x} y={y} dy="0.36em" fontSize={r * 1.15}>
                {(armies[t.id] ?? 0) + extra}
              </text>
              {extra > 0 && (
                <text x={x + r * 1.1} y={y - r * 0.9} className="rk-roundel__extra" fontSize={r}>
                  +{extra}
                </text>
              )}
              {showNames && (
                <text x={x} y={y + r + font * 1.05} className="rk-name" fontSize={font}>
                  {nameLines(t.name).map((line, i) => (
                    <tspan key={i} x={x} dy={i ? '1.05em' : 0}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {zoomable && (
        <button
          type="button"
          className="rk-map__whole"
          onClick={() => setView({ cx: w / 2, cy: h / 2, z: shown.z > 1.01 ? 1 : cover })}
        >
          {shown.z > 1.01 ? 'Whole map' : 'Closer'}
        </button>
      )}
    </div>
  );
}
