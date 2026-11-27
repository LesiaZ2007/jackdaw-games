'use client';
// SPIKE (docs/maze/LIVE-PLAN-1.md): the feel-check page for the live (Contact) maze. Two to four
// phones join one room, steer, bump and eat each other. Not in the catalog; the real Contact
// screens come with the next plan.

import { useEffect, useRef, useState } from 'react';
import { DYING_MS } from '../sim/chomper';
import { layoutsOf, type ContactEvent, type LiveChomper } from '../live';
import { pelletIndex } from '../sim/pellets';
import { powerMs } from '../sim/powers';
import type { Dir } from '../sim/walker';
import type { FrameBanner, FrameEffect, FrameModel } from './frame';
import { Cards, SoundButton } from './hud';
import { FRAME_PAD, fitTile, keyDir, swipeDir } from './layout';
import { LiveClient } from './live-client';
import { draw } from './render/core';
import { useSize, useSound } from './use-maze';
import './maze.css';
import './live-spike.css';

const BIRDS = ['Wren', 'Rook', 'Robin', 'Finch', 'Heron', 'Magpie'];
const BANNER_MS = 1600;
const SHAKE_MS = 160;

type Phase =
  { kind: 'form' } | { kind: 'connecting' } | { kind: 'playing' } | { kind: 'closed'; why: string };

interface Live {
  ws: WebSocket;
  client: LiveClient | null;
  me: string;
}

export function LiveSpike() {
  const [name, setName] = useState(() => BIRDS[randomInt(BIRDS.length)] ?? 'Wren');
  const [room, setRoom] = useState('JACK');
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const live = useRef<Live | null>(null);
  const [joined, setJoined] = useState<Live | null>(null);

  const join = () => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/live/spike/${room.toUpperCase()}`);
    live.current = { ws, client: null, me: '' };
    setPhase({ kind: 'connecting' });
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, device: deviceId() }));
    ws.onclose = (e) =>
      setPhase({ kind: 'closed', why: e.reason === 'full' ? 'The room is full (4).' : e.reason });
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as
        | {
            t: 'hello';
            id: string;
            serverNow: number;
            startedAt: number;
            layoutId: string;
            taken: number[];
          }
        | { t: 'snap'; s: Parameters<LiveClient['onSnapshot']>[0]; serverNow: number };
      const l = live.current;
      if (!l) return;
      if (msg.t === 'hello') {
        const layout = layoutsOf('Medium').find((m) => m.id === msg.layoutId)!;
        l.me = msg.id;
        l.client = new LiveClient({
          me: msg.id,
          layout,
          startedAt: msg.startedAt,
          offsetMs: msg.serverNow - Date.now(),
          taken: msg.taken,
        });
        setJoined(l);
        setPhase({ kind: 'playing' });
      } else if (msg.t === 'snap') l.client?.onSnapshot(msg.s, msg.serverNow - Date.now());
    };
  };

  useEffect(() => () => live.current?.ws.close(), []);

  if (phase.kind !== 'playing' || !joined)
    return (
      <div className="mz mz-player mz-spike-form">
        <form
          className="mz-spike-card"
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <h1>Live maze: feel check</h1>
          <p>
            Everyone on the same room code shares one maze. Bump costs both 50. Grab the power spot
            and you can eat the others.
          </p>
          <label>
            Name
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Room
            <input
              value={room}
              maxLength={8}
              onChange={(e) => setRoom(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
            />
          </label>
          <button type="submit" disabled={phase.kind === 'connecting'}>
            {phase.kind === 'connecting' ? 'Joining…' : 'Join'}
          </button>
          {phase.kind === 'closed' ? <p role="alert">Disconnected. {phase.why}</p> : null}
        </form>
      </div>
    );

  return joined ? <LivePlay live={joined} name={name} /> : null;
}

/** The playing screen; mounted once joined, so its stage is measured from the start. */
function LivePlay({ live: l, name }: { live: Live; name: string }) {
  const [model, setModel] = useState<FrameModel | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(stageRef);
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  const sound = useSound(name);
  const [shakeKey, setShakeKey] = useState(0);

  const steer = (d: Dir) => {
    if (!l.client || l.ws.readyState !== WebSocket.OPEN) return;
    sound.unlock();
    l.client.turn(d);
  };

  // Arrow keys and WASD.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const d = keyDir(e.key);
      if (!d) return;
      e.preventDefault();
      steer(d);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });

  // The draw loop.
  useEffect(() => {
    const layout = layoutsOf('Medium')[0]!;
    const index = pelletIndex(layout);
    const plain: [number, number, number][] = [];
    for (const [k, i] of index) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      if (layout.rows[y]![x] === '.') plain.push([x, y, i]);
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let banner: FrameBanner | null = null;
    let bannerAt = 0;
    let fxKey = 0;
    const mouths = new Map<string, { mouth: number; x: number; y: number }>();
    let raf = 0;
    let last = performance.now();
    let cardsAt = 0;

    const say = (text: string, tone: FrameBanner['tone'], now: number) => {
      banner = { text, tone, power: tone === 'good' ? 'hunt' : null, ageMs: 0, key: ++fxKey };
      bannerAt = now;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = now - last;
      last = now;
      const c = l.client;
      if (!c) return;
      const f = c.frame(Date.now());
      // Turns your chomper took this frame go out with the junction where it took them.
      for (const turn of c.takeOutbox())
        if (l.ws.readyState === WebSocket.OPEN) l.ws.send(JSON.stringify({ t: 'turn', ...turn }));
      const effects: FrameEffect[] = [];
      const nameOf = (id: string) => f.chompers.find((x) => x.id === id)?.name.toUpperCase() ?? '';
      for (const e of f.events) onEvent(e, l.me, now, nameOf, f.chompers, effects);
      if (banner) banner = { ...banner, ageMs: now - bannerAt };
      if (banner && banner.ageMs > BANNER_MS) banner = null;
      const m: FrameModel = {
        look: 'Printed',
        mode: 'Shared',
        phase: 'play',
        tMs: f.t,
        me: l.me,
        board: {
          layout,
          w: layout.w,
          h: layout.h,
          maze: 0,
          level: 1,
          pellets: plain.filter(([, , i]) => !f.taken.has(i)).map(([x, y]) => [x, y]),
          pelletsRev: f.taken.size,
          powerSpots: layout.powers.map(([x, y], spot) => ({
            spot,
            x,
            y,
            kind: 'hunt' as const,
            up: !f.taken.has(index.get(`${x},${y}`) ?? -1),
          })),
          fruit: null,
          chompers: f.chompers.map((ch) => toFrame(ch, l.me, f.t, dt, mouths)),
          ghosts: [],
          fog: null,
          frozenMs: 0,
        },
        minis: [],
        scores: f.chompers
          .slice()
          .sort((a, b) => a.seat - b.seat)
          .map((ch) => ({
            id: ch.id,
            name: ch.name,
            colorIndex: ch.seat,
            score: ch.score,
            isYou: ch.id === l.me,
            lives: 0,
            maze: 0,
            cleared: 0,
            power: power(ch, f.t),
            done: false,
            finishMs: null,
          })),
        timerMs: null,
        countdown: null,
        go: false,
        banner,
        effects,
        you: null,
        sharedMaze: null,
      };
      sound.hear(m);
      // The score cards only need a few updates a second; the canvas draws every frame.
      if (now - cardsAt > 120) {
        cardsAt = now;
        setModel(m);
      }
      paint(m, now);
    };

    function onEvent(
      e: ContactEvent,
      me: string,
      now: number,
      nameOf: (id: string) => string,
      chompers: LiveChomper[],
      effects: FrameEffect[],
    ) {
      if (e.kind === 'bump') {
        if (e.a !== me && e.b !== me) return;
        navigator.vibrate?.(40);
        if (!reduced) setShakeKey((k) => k + 1);
        say(`BUMP −${e.cost}`, 'info', now);
      } else if (e.eaten === me) {
        navigator.vibrate?.([60, 40, 120]);
        const ch = chompers.find((x) => x.id === me);
        effects.push({
          key: ++fxKey,
          kind: 'caught',
          x: ch?.x ?? 0,
          y: ch?.y ?? 0,
          by: me,
          mine: true,
        });
        say(`${nameOf(e.by)} ATE YOU −${e.cost}`, 'bad', now);
      } else if (e.by === me) {
        navigator.vibrate?.(30);
        say(`YOU ATE ${nameOf(e.eaten)} +${e.gain}`, 'good', now);
      }
    }

    function paint(m: FrameModel, now: number) {
      const cv = canvasRef.current;
      const b = m.board!;
      const { w, h } = sizeRef.current;
      if (!cv || w <= 0 || h <= 0) return;
      const tile = fitTile(w, h, b.w, b.h);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const pw = Math.round(b.w * tile * dpr);
      const ph = Math.round(b.h * tile * dpr);
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
        cv.style.width = `${b.w * tile}px`;
        cv.style.height = `${b.h * tile}px`;
      }
      const ctx = cv.getContext('2d');
      if (ctx) draw(ctx, m, { look: m.look, tile, dpr, t: now });
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swipes anywhere on the screen; a long drag can turn more than once.
  const origin = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="mz mz-player"
      onPointerDown={(e) => {
        sound.unlock();
        origin.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        const o = origin.current;
        if (!o) return;
        const d = swipeDir(e.clientX - o.x, e.clientY - o.y);
        if (!d) return;
        steer(d);
        origin.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => (origin.current = null)}
      onPointerCancel={() => (origin.current = null)}
      onPointerLeave={() => (origin.current = null)}
      style={{ ['--mz-pad' as string]: `${FRAME_PAD}px` }}
    >
      {model ? (
        <Cards model={model} extra={<SoundButton muted={sound.muted} toggle={sound.toggle} />} />
      ) : null}
      <div className="mz-stage" ref={stageRef}>
        <div
          key={shakeKey}
          className={shakeKey ? 'mz-screen mz-spike-shake' : 'mz-screen'}
          style={{ ['--mz-shake-ms' as string]: `${SHAKE_MS}ms` }}
        >
          <canvas ref={canvasRef} className="mz-canvas" aria-label="The maze" />
        </div>
      </div>
    </div>
  );
}

function randomInt(n: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! % n;
}

/** A per-device id kept in this browser, so a reload gets the same chomper back. */
function deviceId(): string {
  const key = 'jackdaw:live-spike:device';
  try {
    const had = localStorage.getItem(key);
    if (had) return had;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function power(ch: LiveChomper, t: number) {
  if (!ch.power || ch.power.untilMs <= t) return null;
  return { kind: ch.power.kind, msLeft: ch.power.untilMs - t, totalMs: powerMs(ch.power.kind, 1) };
}

function toFrame(
  ch: LiveChomper,
  me: string,
  t: number,
  dt: number,
  mouths: Map<string, { mouth: number; x: number; y: number }>,
) {
  const prev = mouths.get(ch.id);
  const moved = !prev || Math.abs(prev.x - ch.x) + Math.abs(prev.y - ch.y) > 0.001;
  const mouth = (prev?.mouth ?? 0) + (moved ? dt / 60 : 0);
  mouths.set(ch.id, { mouth, x: ch.x, y: ch.y });
  return {
    id: ch.id,
    name: ch.name,
    colorIndex: ch.seat,
    x: ch.x,
    y: ch.y,
    dir: ch.dir ?? 'right',
    mouth,
    alpha: 1,
    isYou: ch.id === me,
    power: power(ch, t),
    frozenMs: 0,
    foggedMs: 0,
    dying: ch.dyingUntil > t ? 1 - (ch.dyingUntil - t) / DYING_MS : null,
    shieldMs: Math.max(0, ch.shieldUntil - t),
    trail: [],
  };
}
