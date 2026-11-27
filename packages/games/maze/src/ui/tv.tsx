'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { GameUi } from '@jackdaw/ui';
import type { MazeTableView } from '../rules';
import { layoutAt } from '../sim/generate';
import type { FrameModel } from './frame';
import { Cards, EndPanel } from './hud';
import { fitTile, miniGrid } from './layout';
import { LiveScreen } from './live-screen';
import { LOOKS, draw, drawMini } from './render/core';
import { colorOf } from './render/look';
import { useConfetti, useMazeLoop, useSize } from './use-maze';
import './maze.css';

/**
 * Maze on the TV. Solo: the one maze, big. Shared: the one maze with every chomper at full
 * strength and named. Race: everyone's maze in miniature, with the maze number each is on.
 */
export const TvScreen: GameUi['TvScreen'] = (props) => {
  const table = props.tableView as MazeTableView;
  if (table.mode === 'Contact')
    return <LiveScreen table={table} tv livePass={props.livePass} soundId={null} />;
  return <PolledTv {...props} />;
};

const PolledTv: GameUi['TvScreen'] = ({ tableView, players, now }) => {
  const table = tableView as MazeTableView;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minis = useRef(new Map<string, HTMLCanvasElement>());
  const size = useSize(stageRef);
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  const fx = useConfetti();
  const shared = table.mode === 'Shared';
  const lay = layoutAt(table, 0);

  const onFrame = useCallback((m: FrameModel, t: number) => {
    const { w, h } = sizeRef.current;
    if (w <= 0 || h <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const b = m.board;
    const c = canvasRef.current;
    if (b && c) {
      const tile = fitTile(w, h, b.w, b.h);
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
      return;
    }
    if (!m.minis.length) return;
    const first = m.minis[0]!.layout;
    const { tile } = miniGrid(m.minis.length, w, h, first.w, first.h);
    for (const mini of m.minis) {
      const mc = minis.current.get(mini.id);
      if (!mc) continue;
      const pw = Math.round(mini.layout.w * tile * dpr);
      const ph = Math.round(mini.layout.h * tile * dpr);
      if (mc.width !== pw || mc.height !== ph) {
        mc.width = pw;
        mc.height = ph;
        mc.style.width = `${mini.layout.w * tile}px`;
        mc.style.height = `${mini.layout.h * tile}px`;
      }
      const ctx = mc.getContext('2d');
      if (ctx) drawMini(ctx, mini, { look: m.look, tile, dpr, t });
    }
  }, []);

  const { model } = useMazeLoop({ me: null, table, view: null, players, now, onFrame });

  const ended = table.phase === 'between' || table.phase === 'over';
  const endedRound = useRef(-1);
  useEffect(() => {
    if (!ended || endedRound.current === table.round) return;
    endedRound.current = table.round;
    fx.fire(200);
  }, [ended, table.round, fx]);

  const minisOn = model?.board === null && (model?.minis.length ?? 0) > 0;
  const grid = miniGrid(model?.minis.length ?? 1, size.w, size.h, lay.w, lay.h);

  return (
    <div className="mz mz-tv">
      {model ? <Cards model={model} tv /> : null}
      <div className="mz-stage" ref={stageRef}>
        {minisOn && model ? (
          <div
            className="mz-minis"
            style={{ gridTemplateColumns: `repeat(${grid.cols}, max-content)` }}
          >
            {model.minis.map((mini) => {
              const s = model.scores.find((x) => x.id === mini.id);
              return (
                <figure key={mini.id} className="mz-mini">
                  <figcaption className="mz-mini__cap">
                    <i
                      className="mz-card__dot"
                      style={{ background: colorOf(LOOKS[model.look].players, mini.colorIndex) }}
                      aria-hidden
                    />
                    <span className="mz-mini__name">{mini.name}</span>
                    {table.mode === 'Race' ? (
                      <span className="mz-mini__maze">
                        Maze {Math.min(mini.maze + 1, table.options.mazes)}/{table.options.mazes}
                      </span>
                    ) : null}
                    <b className="mz-mini__score">{s?.score ?? 0}</b>
                  </figcaption>
                  <canvas
                    className="mz-canvas"
                    aria-label={`${mini.name}'s maze`}
                    ref={(el) => {
                      if (el) minis.current.set(mini.id, el);
                      else minis.current.delete(mini.id);
                    }}
                  />
                </figure>
              );
            })}
          </div>
        ) : (
          <div className="mz-screen">
            <canvas ref={canvasRef} className="mz-canvas" aria-label="The maze" />
          </div>
        )}
        {model?.countdown && !shared && minisOn ? (
          <div className="mz-tvcount" aria-hidden>
            {model.countdown.n}
          </div>
        ) : null}
        {model && ended ? <EndPanel model={model} best={0} newBest={false} tv /> : null}
      </div>
    </div>
  );
};
