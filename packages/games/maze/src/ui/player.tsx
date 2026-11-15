'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameUi } from '@jackdaw/ui';
import type { MazePlayerView, MazeTableView } from '../rules';
import type { FrameModel } from './frame';
import { Cards, ClearedPanel, EndPanel, SoundButton, StartPanel } from './hud';
import { FRAME_PAD, fitTile, keyDir, swipeDir } from './layout';
import { LOOKS, draw } from './render/core';
import { readBest, useConfetti, useMazeLoop, useSize, useSound, writeBest } from './use-maze';
import './maze.css';

/**
 * Maze on a phone: the score cards across the top, then your maze, fitted into whatever room is
 * left so it never sits under the cards or scrolls. Swipe anywhere (or use the arrow keys or
 * WASD) to steer. Panels in the printed style open and close the round.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  tableView,
  me,
  players,
  now,
  sendAction,
}) => {
  const table = tableView as MazeTableView;
  const v = view as MazePlayerView;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(stageRef);
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  const sound = useSound(me);
  const fx = useConfetti();

  const onFrame = useCallback(
    (m: FrameModel, t: number) => {
      sound.hear(m);
      for (const e of m.effects) {
        if (e.kind === 'mazeCleared') fx.fire(70, LOOKS[m.look].players);
        else if (e.kind === 'finished') fx.fire(220, LOOKS[m.look].players);
      }
      const c = canvasRef.current;
      const b = m.board;
      const { w, h } = sizeRef.current;
      if (!c || !b || w <= 0 || h <= 0) return;
      const tile = fitTile(w, h, b.w, b.h);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
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
    },
    [sound, fx],
  );

  const { runner, model } = useMazeLoop({
    me,
    table,
    view: v,
    players,
    now,
    send: sendAction,
    onFrame,
  });

  // Arrow keys and WASD.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const d = keyDir(e.key);
      if (!d) return;
      e.preventDefault();
      sound.unlock();
      runner.input(d);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [runner, sound]);

  // Swipes anywhere on the screen; a long drag can turn more than once.
  const origin = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    sound.unlock();
    origin.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const o = origin.current;
    if (!o) return;
    const d = swipeDir(e.clientX - o.x, e.clientY - o.y);
    if (!d) return;
    runner.input(d);
    origin.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerEnd = () => {
    origin.current = null;
  };

  // The end of your round: remember the best score and cheer a win.
  const mine = model?.scores.find((s) => s.isYou);
  const ended = model?.phase === 'finished' || model?.phase === 'over';
  const [best, setBest] = useState<{ best: number; isNew: boolean }>({ best: 0, isNew: false });
  const endedRound = useRef(-1);
  const score = mine?.score ?? 0;
  const over = model?.phase === 'over';
  useEffect(() => {
    if (!ended || endedRound.current === table.round) return;
    endedRound.current = table.round;
    const prev = readBest();
    const isNew = score > prev && score > 0;
    if (isNew) writeBest(score);
    setBest({ best: Math.max(prev, score), isNew });
    if (isNew || over) fx.fire(over ? 200 : 120);
  }, [ended, over, score, table.round, fx]);

  const phase = model?.phase;
  return (
    <div
      className="mz mz-player"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
      style={{ ['--mz-pad' as string]: `${FRAME_PAD}px` }}
    >
      {model ? (
        <Cards model={model} extra={<SoundButton muted={sound.muted} toggle={sound.toggle} />} />
      ) : null}
      <div className="mz-stage" ref={stageRef}>
        <div className="mz-screen">
          <canvas ref={canvasRef} className="mz-canvas" aria-label="The maze" />
        </div>
        {model && phase === 'countdown' && model.you?.maze === 0 ? (
          <StartPanel model={model} options={table.options} />
        ) : null}
        {model && phase === 'cleared' && model.mode === 'Race' ? (
          <ClearedPanel model={model} />
        ) : null}
        {model && ended ? <EndPanel model={model} best={best.best} newBest={best.isNew} /> : null}
      </div>
    </div>
  );
};
