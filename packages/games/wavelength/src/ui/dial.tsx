'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { Spectrum } from '../spectrums';

/** The dial's pivot and radius in its 200 × 112 viewBox. */
const CX = 100;
const CY = 104;
const R = 92;

/** A dial value (0 = left, 100 = right) as an angle in radians, π at the left. */
const angleOf = (v: number) => Math.PI * (1 - v / 100);
const at = (v: number, r: number) => {
  const a = angleOf(v);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const;
};
const clamp = (v: number) => Math.min(100, Math.max(0, v));

/** An annular slice of the dial between two values. */
function slice(from: number, to: number, r0: number, r1: number): string {
  const [ax, ay] = at(clamp(from), r1);
  const [bx, by] = at(clamp(to), r1);
  const [cx, cy] = at(clamp(to), r0);
  const [dx, dy] = at(clamp(from), r0);
  return `M${ax} ${ay}A${r1} ${r1} 0 0 1 ${bx} ${by}L${cx} ${cy}A${r0} ${r0} 0 0 0 ${dx} ${dy}Z`;
}

/** The scoring bands round a target: [from, to, points]. */
const BANDS: [number, number, 2 | 3 | 4][] = [
  [-10, -6, 2],
  [-6, -2, 3],
  [-2, 2, 4],
  [2, 6, 3],
  [6, 10, 2],
];

export interface DialProps {
  spectrum: Spectrum | null;
  /** Where the needle points. */
  value: number;
  /** The target, when this screen may see it. */
  target: number | null;
  /** Open the shutter (the psychic's view, or the reveal). */
  open: boolean;
  /** Drag to turn it; absent, the dial is read-only. */
  onTurn?: (v: number, done: boolean) => void;
  /** The needle follows a finger right now, so it shouldn't ease. */
  live?: boolean;
  /** Everyone guesses, after the reveal: each guesser's own dial. */
  marks?: { id: string; value: number; tint: string }[];
  /** The guessing team, for the needle's cap. */
  team?: 'sun' | 'moon';
  size?: 'phone' | 'tv';
  label?: string;
}

/**
 * The dial board: a half-moon of sable card ticked like a radio tuner, the spectrum's two words on
 * plaques at either end, the target zone printed in bands under a shutter, and the needle.
 */
export function Dial({
  spectrum,
  value,
  target,
  open,
  onTurn,
  live,
  marks,
  team = 'sun',
  size = 'phone',
  label,
}: DialProps) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const valueAt = (e: PointerEvent<SVGSVGElement>) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const a = Math.atan2(CY - p.y, p.x - CX);
    // Below the pivot, snap to whichever end is nearer.
    const angle = a < 0 ? (p.x < CX ? Math.PI : 0) : a;
    return clamp(100 * (1 - angle / Math.PI));
  };

  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (!onTurn) return;
    const v = valueAt(e);
    if (v === null) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onTurn(v, false);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!onTurn || !dragging.current) return;
    const v = valueAt(e);
    if (v !== null) onTurn(v, false);
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    if (!onTurn || !dragging.current) return;
    dragging.current = false;
    const v = valueAt(e);
    onTurn(v ?? value, true);
  };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!onTurn) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onTurn(clamp(value - step), true);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onTurn(clamp(value + step), true);
    else return;
    e.preventDefault();
  };

  const ticks = [];
  for (let i = 0; i <= 40; i++) {
    const v = i * 2.5;
    const long = i % 4 === 0;
    const [x1, y1] = at(v, R - 1.5);
    const [x2, y2] = at(v, R - (long ? 8 : 4.5));
    ticks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        className={long ? 'wl-tick wl-tick--long' : 'wl-tick'}
      />,
    );
  }

  const [left, right] = spectrum ?? ['?', '?'];
  const turn = (value - 50) * 1.8;

  return (
    <div className={`wl-dial wl-dial--${size}${onTurn ? ' is-live' : ''}`}>
      <svg
        ref={svg}
        viewBox="0 0 200 112"
        className="wl-dial__svg"
        role={onTurn ? 'slider' : 'img'}
        aria-label={label ?? (spectrum ? `Dial from ${left} to ${right}` : 'The dial')}
        aria-valuemin={onTurn ? 0 : undefined}
        aria-valuemax={onTurn ? 100 : undefined}
        aria-valuenow={onTurn ? Math.round(value) : undefined}
        aria-valuetext={
          onTurn ? `${Math.round(value)} of 100, toward ${value < 50 ? left : right}` : undefined
        }
        tabIndex={onTurn ? 0 : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
      >
        <defs>
          <clipPath id="wl-face">
            <path d={`M${CX - R} ${CY}A${R} ${R} 0 0 1 ${CX + R} ${CY}Z`} />
          </clipPath>
        </defs>
        <path
          className="wl-dial__rim"
          d={`M${CX - R - 5} ${CY}A${R + 5} ${R + 5} 0 0 1 ${CX + R + 5} ${CY}Z`}
        />
        <path className="wl-dial__face" d={`M${CX - R} ${CY}A${R} ${R} 0 0 1 ${CX + R} ${CY}Z`} />

        <g clipPath="url(#wl-face)">
          {target !== null &&
            BANDS.map(([a, b, pts]) => (
              <path
                key={a}
                d={slice(target + a, target + b, 16, R - 9)}
                className={`wl-band wl-band--${pts}`}
              />
            ))}
          {target !== null &&
            BANDS.map(([a, b, pts]) => {
              const [x, y] = at(target + (a + b) / 2, R - 17);
              return (
                <text
                  key={`n${a}`}
                  x={x}
                  y={y}
                  className="wl-band__n"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {pts}
                </text>
              );
            })}
          <g className={open ? 'wl-shutter is-open' : 'wl-shutter'}>
            <path d={`M${CX - R} ${CY}A${R} ${R} 0 0 1 ${CX + R} ${CY}Z`} />
            <path
              className="wl-shutter__rule"
              d={`M${CX - R + 10} ${CY}A${R - 10} ${R - 10} 0 0 1 ${CX + R - 10} ${CY}`}
            />
          </g>
        </g>

        {ticks}

        {marks?.map((m) => {
          const [x1, y1] = at(m.value, R - 12);
          const [x2, y2] = at(m.value, R - 1);
          return (
            <line
              key={m.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className="wl-mark"
              style={{ stroke: m.tint }}
            />
          );
        })}

        <g
          className={live ? 'wl-needle is-live' : 'wl-needle'}
          style={{ transform: `rotate(${turn}deg)` }}
        >
          <line x1={CX} y1={CY} x2={CX} y2={CY - R + 6} className="wl-needle__shaft" />
          {onTurn && <circle cx={CX} cy={CY - R + 12} r={6} className="wl-needle__knob" />}
        </g>
        <circle cx={CX} cy={CY} r={9} className={`wl-needle__cap wl-needle__cap--${team}`} />
      </svg>
      <div className="wl-dial__ends" aria-hidden="true">
        <span className="wl-end wl-end--left">{left}</span>
        <span className="wl-end wl-end--right">{right}</span>
      </div>
    </div>
  );
}

/** How long a dragging phone trusts its own needle over the server's after its last move. */
const HOLD_MS = 1600;
/** The least time between two dial moves sent while dragging. */
const GAP_MS = 400;

/**
 * Keeps a dial that this phone turns in step with the server over polling. The needle follows
 * the finger at once; moves go out one at a time, at most every GAP_MS, always the newest
 * position (so they can't land out of order), and the last one when the finger lifts. Until a
 * moment after the last move the server's older positions are ignored, so the needle never
 * snaps back.
 */
export function useDialSync(server: number, send: (v: number) => Promise<unknown>) {
  const [local, setLocal] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const st = useRef<Outbox>({ want: null, sent: null, busy: false, lastAt: 0, timer: undefined });
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const pump = useCallback(() => {
    pumpOutbox(
      st.current,
      (v) => sendRef.current(v),
      () => setNow(Date.now()),
    );
  }, []);

  useEffect(() => {
    const s = st.current;
    return () => clearTimeout(s.timer);
  }, []);

  // Let go of the local needle a moment after the last move has been saved.
  useEffect(() => {
    if (local === null) return;
    const t = setTimeout(() => {
      const s = st.current;
      if (!s.busy && s.want === s.sent && Date.now() - s.lastAt >= HOLD_MS) setLocal(null);
      else setNow(Date.now());
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [local, now]);

  const turn = useCallback(
    (v: number, done: boolean) => {
      const tidy = Math.round(v * 10) / 10;
      setLocal(tidy);
      st.current.want = tidy;
      if (done) st.current.lastAt = Math.min(st.current.lastAt, Date.now() - GAP_MS);
      pump();
    },
    [pump],
  );

  /** Send any move still waiting at once, and resolve when none is left out (for Lock in). */
  const flush = useCallback(async () => {
    const s = st.current;
    s.lastAt = Math.min(s.lastAt, Date.now() - GAP_MS);
    clearTimeout(s.timer);
    pump();
    for (let i = 0; i < 60 && (s.busy || (s.want !== null && s.want !== s.sent)); i++) {
      await new Promise((done) => setTimeout(done, 50));
    }
  }, [pump]);

  return { value: local ?? server, live: local !== null, turn, flush };
}

/** The dial moves waiting to go: the newest wanted, the last sent, and whether one is out. */
interface Outbox {
  want: number | null;
  sent: number | null;
  busy: boolean;
  lastAt: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** Send the newest wanted position if nothing is out and the gap has passed; else wait. */
function pumpOutbox(s: Outbox, send: (v: number) => Promise<unknown>, onSaved: () => void) {
  if (s.busy || s.want === null || s.want === s.sent) return;
  const wait = s.lastAt + GAP_MS - Date.now();
  if (wait > 0) {
    clearTimeout(s.timer);
    s.timer = setTimeout(() => pumpOutbox(s, send, onSaved), wait);
    return;
  }
  const v = s.want;
  s.busy = true;
  s.sent = v;
  s.lastAt = Date.now();
  void send(v).finally(() => {
    s.busy = false;
    s.lastAt = Date.now();
    onSaved();
    pumpOutbox(s, send, onSaved);
  });
}
