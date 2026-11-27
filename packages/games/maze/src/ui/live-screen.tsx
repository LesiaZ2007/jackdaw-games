'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { MazeTableView } from '../rules';
import { resolveMaze } from '../sim/generate';
import type { Dir } from '../sim/walker';
import type { FrameModel } from './frame';
import { AwayPanel, Cards, EndPanel, SoundButton, StartPanel } from './hud';
import { FRAME_PAD, fitTile, keyDir, swipeDir } from './layout';
import { LiveClient, type LiveFrame } from './live-client';
import { LiveFramer } from './live-frame';
import { LOOKS, draw } from './render/core';
import { useConfetti, useSize, useSound } from './use-maze';
import './maze.css';

/** What the shell's `livePass` gives: a signed pass and the room's socket path. */
export interface LivePassReply {
  pass: string;
  path: string;
}
export type LivePassFn = () => Promise<LivePassReply | null>;

/** The score cards need only a few updates a second; the canvas draws every frame. */
const CARDS_MS = 120;
/** Waits between reconnects grow by this much, up to RETRY_MAX_MS. */
const RETRY_MS = 500;
const RETRY_MAX_MS = 5_000;

type Hello = {
  t: 'hello';
  id: string | null;
  serverNow: number;
  startedAt: number;
  maze: number;
  taken: number[];
};
type Snap = { t: 'snap'; s: Parameters<LiveClient['onSnapshot']>[0]; serverNow: number };

/**
 * A live (Contact) round, on a phone or the TV (docs/maze/LIVE.md, "The phones and TV"). The
 * round runs in the live room; this screen fetches a pass through the shell, keeps a socket to
 * the room, predicts your own chomper with LiveClient and draws with the usual renderer. On a
 * site without live rooms (`livePass` missing) it points the player at the one that has them.
 */
export function LiveScreen(props: {
  table: MazeTableView;
  tv: boolean;
  livePass: LivePassFn | undefined;
  soundId: string | null;
}) {
  if (!props.livePass) return <LiveAway tv={props.tv} />;
  return <LiveRoomScreen {...props} livePass={props.livePass} />;
}

const noSubscribe = () => () => {};

function LiveAway({ tv }: { tv: boolean }) {
  // This page on the live site (none while rendering on the server).
  const href = useSyncExternalStore(
    noSubscribe,
    () => `https://jackdaw.lastivka.dev${location.pathname}`,
    () => null,
  );
  return (
    <div className={tv ? 'mz mz-tv' : 'mz mz-player'}>
      <div className="mz-stage">
        <AwayPanel href={href} />
      </div>
    </div>
  );
}

function LiveRoomScreen({
  table,
  tv,
  livePass,
  soundId,
}: {
  table: MazeTableView;
  tv: boolean;
  livePass: LivePassFn;
  soundId: string | null;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(stageRef);
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  const sound = useSound(tv ? null : soundId);
  const fx = useConfetti();
  const [model, setModel] = useState<FrameModel | null>(null);
  const [lost, setLost] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  const layouts = useMemo(
    () => table.layouts.map(resolveMaze),
    // A round's mazes change only with the round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table.round, table.seed],
  );
  const tableRef = useRef(table);
  const live = useRef<{
    ws: WebSocket | null;
    client: LiveClient | null;
    framer: LiveFramer | null;
  }>({ ws: null, client: null, framer: null });
  useEffect(() => {
    tableRef.current = table;
    live.current.framer?.setTable(table);
  }, [table]);

  const playing = table.phase === 'play' || table.phase === 'countdown';

  // The socket: fetch a pass, connect, and reconnect (with a fresh pass) if it drops.
  useEffect(() => {
    if (!playing) return;
    const l = live.current;
    let stop = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = () => {
      if (stop) return;
      tries++;
      timer = setTimeout(connect, Math.min(RETRY_MAX_MS, RETRY_MS * tries));
    };
    const connect = async () => {
      const got = await livePass().catch(() => null);
      if (stop) return;
      if (!got) return again();
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${proto}//${location.host}${got.path}?pass=${encodeURIComponent(got.pass)}`,
      );
      live.current.ws = ws;
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return;
        let msg: Hello | Snap;
        try {
          msg = JSON.parse(e.data) as Hello | Snap;
        } catch {
          return;
        }
        if (msg.t === 'hello') {
          tries = 0;
          const me = tv ? null : msg.id;
          live.current.client = new LiveClient({
            me,
            layouts,
            maze: msg.maze,
            startedAt: msg.startedAt,
            offsetMs: msg.serverNow - Date.now(),
            taken: msg.taken,
            powers: tableRef.current.powers,
          });
          live.current.framer = new LiveFramer({ me, layouts, table: tableRef.current });
          setLost(null);
        } else if (msg.t === 'snap')
          live.current.client?.onSnapshot(msg.s, msg.serverNow - Date.now());
      };
      ws.onclose = (e) => {
        if (live.current.ws === ws) live.current.ws = null;
        if (stop) return;
        if (e.code === 4001) setLost('You’re playing on another device now.');
        else if (e.code === 4003) setLost('This device isn’t in this round.');
        else again();
      };
    };
    void connect();
    return () => {
      stop = true;
      clearTimeout(timer);
      l.ws?.close(1000, 'Left');
      l.ws = null;
    };
  }, [playing, livePass, layouts, tv]);

  // The draw loop.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let cardsAt = 0;
    let phase = '';
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const { client, framer, ws } = live.current;
      if (!client || !framer) return;
      const f: LiveFrame = client.frame(Date.now());
      for (const turn of client.takeOutbox())
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'turn', ...turn }));
      const m = framer.build(f, now);
      sound.hear(m);
      for (const e of m.effects) {
        if (e.kind === 'mazeCleared') fx.fire(70, LOOKS[m.look].players);
        else if (e.kind === 'finished') fx.fire(220, LOOKS[m.look].players);
        else if (!tv && e.kind === 'caught' && e.mine) navigator.vibrate?.([60, 40, 120]);
      }
      if (!tv && m.banner?.ageMs === 0 && m.banner.text.startsWith('BUMP')) {
        navigator.vibrate?.(40);
        if (!reduced) setShake((k) => k + 1);
      }
      if (now - cardsAt > CARDS_MS || m.phase !== phase) {
        cardsAt = now;
        phase = m.phase;
        setModel(m);
      }
      paint(m, now);
    };
    const paint = (m: FrameModel, t: number) => {
      const c = canvasRef.current;
      const b = m.board;
      const { w, h } = sizeRef.current;
      if (!c || !b || w <= 0 || h <= 0) return;
      const tile = fitTile(w, h, b.w, b.h);
      const dpr = Math.min(tv ? 2 : 3, window.devicePixelRatio || 1);
      const pw = Math.round(b.w * tile * dpr);
      const ph = Math.round(b.h * tile * dpr);
      if (c.width !== pw || c.height !== ph) {
        c.width = pw;
        c.height = ph;
        c.style.width = `${b.w * tile}px`;
        c.style.height = `${b.h * tile}px`;
      }
      const ctx = c.getContext('2d');
      if (ctx) draw(ctx, m, { look: m.look, tile, dpr, t });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sound, fx, tv]);

  const steer = (d: Dir) => {
    const { client, ws } = live.current;
    if (!client || ws?.readyState !== WebSocket.OPEN) return;
    sound.unlock();
    client.turn(d);
  };

  // Arrow keys and WASD.
  useEffect(() => {
    if (tv) return;
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

  // Swipes anywhere on the screen; a long drag can turn more than once.
  const origin = useRef<{ x: number; y: number } | null>(null);
  const touch = tv
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent) => {
          sound.unlock();
          origin.current = { x: e.clientX, y: e.clientY };
        },
        onPointerMove: (e: React.PointerEvent) => {
          const o = origin.current;
          if (!o) return;
          const d = swipeDir(e.clientX - o.x, e.clientY - o.y);
          if (!d) return;
          steer(d);
          origin.current = { x: e.clientX, y: e.clientY };
        },
        onPointerUp: () => (origin.current = null),
        onPointerCancel: () => (origin.current = null),
        onPointerLeave: () => (origin.current = null),
      };

  const ended = model?.phase === 'over' || !playing;
  return (
    <div
      className={tv ? 'mz mz-tv' : 'mz mz-player'}
      {...touch}
      style={{ ['--mz-pad' as string]: `${FRAME_PAD}px` }}
    >
      {model ? (
        tv ? (
          <Cards model={model} tv />
        ) : (
          <Cards model={model} extra={<SoundButton muted={sound.muted} toggle={sound.toggle} />} />
        )
      ) : null}
      <div className="mz-stage" ref={stageRef}>
        <div key={shake} className={shake ? 'mz-screen mz-live-shake' : 'mz-screen'}>
          <canvas ref={canvasRef} className="mz-canvas" aria-label="The maze" />
        </div>
        {!tv && model && model.phase === 'countdown' && model.tMs < 0 ? (
          <StartPanel model={model} options={table.options} />
        ) : null}
        {model && ended ? <EndPanel model={model} best={0} newBest={false} tv={tv} /> : null}
        {lost ? <AwayPanel href={null} note={lost} /> : null}
      </div>
    </div>
  );
}
