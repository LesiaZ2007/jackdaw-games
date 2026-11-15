'use client';

import { useState, type CSSProperties } from 'react';
import { Lid, Plaque } from '@jackdaw/ui';
import { enabledPowers } from '../options';
import type { MazeOptions } from '../options';
import type { Mode } from '../rules';
import type { FrameModel, FrameScore } from './frame';
import { POWER_INFO, POWER_LABEL, clock } from './info';
import { LOOKS } from './render/core';
import { colorOf } from './render/look';
import { useCountUp } from './use-maze';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** A number that bumps when it goes up. */
function useBump(v: number): number {
  const [s, set] = useState({ v, k: 0 });
  if (s.v !== v) set({ v, k: v > s.v ? s.k + 1 : s.k });
  return s.k;
}

function Card({ s, model }: { s: FrameScore; model: FrameModel }) {
  const look = LOOKS[model.look];
  const bump = useBump(s.score);
  const p = s.power;
  const color = p ? look.power[p.kind] : '';
  return (
    <div
      className={`mz-card${s.isYou ? ' is-you' : ''}${s.done ? ' is-done' : ''}`}
      style={vars({ '--mz-dot': colorOf(look.players, s.colorIndex) })}
    >
      <i className="mz-card__dot" aria-hidden />
      <span className="mz-card__name">{s.name}</span>
      <b key={bump} className={`mz-card__score${bump ? ' is-bump' : ''}`}>
        {s.score}
      </b>
      {p ? (
        <>
          <span className="mz-card__power" style={{ color }}>
            {POWER_LABEL[p.kind]}
          </span>
          <i
            className="mz-card__bar"
            style={{
              width: `${Math.max(0, Math.min(100, (p.msLeft / Math.max(1, p.totalMs)) * 100))}%`,
              background: color,
            }}
            aria-hidden
          />
        </>
      ) : null}
    </div>
  );
}

/** Lives and the maze you are on (Solo), or the bell (Shared and Race). */
export function Chip({ model }: { model: FrameModel }) {
  const you = model.you;
  const hearts =
    model.mode === 'Solo' && you
      ? Array.from({ length: 3 }, (_, i) => (i < you.lives ? '♥' : '♡')).join(' ')
      : null;
  return (
    <div className="mz-chip" role="status">
      {hearts ? (
        <span className="mz-chip__hearts" aria-label={`${you!.lives} lives`}>
          {hearts}
        </span>
      ) : null}
      {you ? (
        <span className="mz-chip__txt">
          Maze {Math.min(you.maze + 1, you.mazes)}/{you.mazes}
        </span>
      ) : null}
      {model.timerMs !== null ? (
        <span className="mz-chip__time" aria-label="Time left">
          {clock(model.timerMs)}
        </span>
      ) : null}
    </div>
  );
}

/** The score cards across the top: one per player, yours marked. */
export function Cards({
  model,
  extra,
  tv,
}: {
  model: FrameModel;
  extra?: React.ReactNode;
  tv?: boolean;
}) {
  return (
    <div className={`mz-cards${tv ? ' is-tv' : ''}`} data-count={model.scores.length}>
      <Chip model={model} />
      {model.scores.map((s) => (
        <Card key={s.id} s={s} model={model} />
      ))}
      {extra}
    </div>
  );
}

const ModeKicker: Record<Mode, string> = {
  Solo: 'Solo',
  Shared: 'Shared maze',
  Race: 'Race',
};

/** What this round is, over the maze while the countdown runs. */
export function StartPanel({ model, options }: { model: FrameModel; options: MazeOptions }) {
  const others = Math.max(0, model.scores.length - 1);
  const title =
    model.mode === 'Solo'
      ? `Clear ${options.mazes} ${options.mazes === 1 ? 'maze' : 'mazes'}`
      : model.mode === 'Shared'
        ? 'Most points wins'
        : 'First to finish wins big';
  const line =
    model.mode === 'Solo'
      ? 'Eat every pellet. Dodge the ghosts. Three lives.'
      : model.mode === 'Shared'
        ? `One maze with ${others} ${others === 1 ? 'other' : 'others'}. The first to a pellet scores it. You pass through each other.`
        : 'Everyone runs the same mazes alone. Clearing the last one first earns a bonus.';
  const powers = enabledPowers(options);
  const look = LOOKS[model.look];
  return (
    <div className="mz-over mz-over--low" aria-live="polite">
      <Lid className="mz-lid">
        <div className="mz-kicker">
          {ModeKicker[model.mode]} · {options.powerUps === 'Mixed' ? 'Mixed' : 'Classic'} power-ups
        </div>
        <h2 className="mz-lid__title">{title}</h2>
        <p className="mz-lid__p">{line}</p>
        {options.powerUps === 'Mixed' ? (
          <ul className="mz-legend">
            {powers.map((k) => (
              <li key={k} style={{ color: look.power[k] }} title={POWER_INFO[k]}>
                {POWER_LABEL[k]}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mz-keys">Swipe, or use the arrow keys or WASD</div>
      </Lid>
    </div>
  );
}

/** A maze cleared, waiting for the next one (Race and Solo). */
export function ClearedPanel({ model }: { model: FrameModel }) {
  const you = model.you;
  return (
    <div className="mz-over mz-over--low" aria-live="polite">
      <Lid className="mz-lid mz-lid--small">
        <div className="mz-kicker">Maze {you ? you.maze : ''} cleared</div>
        <h2 className="mz-lid__title">Hold on</h2>
        <p className="mz-lid__p">The next maze starts in a moment.</p>
      </Lid>
    </div>
  );
}

/** Ranking rows that rise in one by one. */
export function Ranking({
  rows,
}: {
  rows: { id: string; name: string; score: number; color: string; isYou?: boolean }[];
}) {
  return (
    <ol className="mz-rank">
      {rows.map((r, i) => (
        <li
          key={r.id}
          className={r.isYou ? 'is-you' : ''}
          style={{ animationDelay: `${0.25 + i * 0.15}s` }}
        >
          <span className="mz-rank__n">{i + 1}</span>
          <i className="mz-card__dot" style={{ background: r.color }} aria-hidden />
          <span className="mz-rank__name">{r.name}</span>
          <span className="mz-rank__s">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}

/** The end of your round: game over, all mazes cleared, or the final ranking. */
export function EndPanel({
  model,
  best,
  newBest,
  note,
  tv,
}: {
  model: FrameModel;
  best: number;
  newBest: boolean;
  note?: string;
  /** On the TV nobody is "you": the leader's score is shown. */
  tv?: boolean;
}) {
  const look = LOOKS[model.look];
  const order = [...model.scores].sort((a, b) => b.score - a.score);
  const mine = tv ? order[0] : (model.scores.find((s) => s.isYou) ?? model.scores[0]);
  const total = useCountUp(mine?.score ?? 0);
  const solo = model.mode === 'Solo';
  const won = solo ? !!mine && mine.lives > 0 : !tv && order[0]?.id === mine?.id;
  const waiting = !solo && !tv && model.phase === 'finished';
  const title = solo
    ? won
      ? 'Splendid!'
      : 'Game over'
    : waiting
      ? 'Finished!'
      : won
        ? 'You win!'
        : `${order[0]?.name ?? 'Someone'} wins`;
  const kicker = solo
    ? won
      ? `All ${model.you?.mazes ?? ''} mazes cleared`
      : `Maze ${(model.you?.maze ?? 0) + 1} of ${model.you?.mazes ?? ''}`
    : waiting
      ? 'Waiting for the others'
      : 'Round over';
  return (
    <div className="mz-over" aria-live="polite">
      <Lid className="mz-lid">
        <div className="mz-kicker">{kicker}</div>
        <h2 className="mz-lid__title">{title}</h2>
        <div className="mz-big" aria-label="Your score">
          {total}
        </div>
        <p className="mz-lid__p">
          {newBest ? <b className="mz-best">New best!</b> : best > 0 ? `Best ${best}` : ''}
          {note ? ` ${note}` : ''}
        </p>
        {!solo ? (
          <Ranking
            rows={order.map((s) => ({
              id: s.id,
              name: s.name,
              score: s.score,
              color: colorOf(look.players, s.colorIndex),
              isYou: s.isYou,
            }))}
          />
        ) : null}
      </Lid>
    </div>
  );
}

/** The sound switch. */
export function SoundButton({ muted, toggle }: { muted: boolean; toggle: () => void }) {
  return (
    <Plaque small onClick={toggle} aria-pressed={!muted} className="mz-sound">
      {muted ? 'Sound off' : 'Sound on'}
    </Plaque>
  );
}
