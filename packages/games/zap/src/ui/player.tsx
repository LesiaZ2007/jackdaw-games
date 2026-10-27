'use client';

import { useEffect, useState } from 'react';
import {
  Plaque,
  useCountdown,
  useMoment,
  useTheme,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { checkPath } from '../puzzle';
import { ranking, type ZapAction, type ZapPlayerView } from '../rules';
import { clock } from '../time';
import { BoltMark, Board } from './board';
import { PlayerCard, Spectate } from './card';
import { place, Race, useTick } from './race';
import { findMistake, nextStep, type Hint } from '../hints';
import './zap.css';

/** The line on a puzzle, kept on this device so a refresh doesn't wipe it. */
function useLine(key: string) {
  const read = (): number[] => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as number[] | null;
      if (Array.isArray(saved) && saved.every((c) => Number.isInteger(c))) return saved;
    } catch {
      // Private browsing or a bad entry: start the board clean.
    }
    return [];
  };
  const [state, setState] = useState(() => ({ key, path: read(), undo: [] as number[][] }));
  if (state.key !== key) setState({ key, path: read(), undo: [] });
  const save = (path: number[]) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(path));
    } catch {
      // Not saved; the board still works.
    }
  };
  const set = (next: number[]) => {
    setState((s) => ({ ...s, path: next, undo: [...s.undo.slice(-80), s.path] }));
    save(next);
  };
  const undo = () =>
    setState((s) => {
      const prev = s.undo.at(-1);
      if (!prev) return s;
      save(prev);
      return { ...s, path: prev, undo: s.undo.slice(0, -1) };
    });
  return { path: state.path, set, undo, canUndo: state.undo.length > 0 };
}

/**
 * Zap on a phone: the puzzle you're on fills the screen, your clock above it, and Undo and Clear
 * under it with the race beside (on a laptop) or below. A finished line goes to the server by
 * itself; the next puzzle opens once it's counted.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  now,
  reactions,
  ...props
}) => {
  const v = view as ZapPlayerView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const solo = v.players.length === 1;
  const { path, set, undo, canUndo } = useLine(`jackdaw:zap:${v.startedAt}:${v.me}:${v.index}`);
  const [sent, setSent] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [fresh, dismiss] = useMoment(v.index);
  const closing = useCountdown(v.closesAt, now);
  useTick();

  // Hints, alone with hints on: shown until the board changes, and counted by the server.
  const [tipAt, setTip] = useState<{ at: string; hint: Hint } | null>(null);
  const here = `${v.index}:${path.join(',')}`;
  const tip = tipAt?.at === here ? tipAt.hint : null;
  const helped = v.helped[v.index] ?? 0;
  const ask = (kind: 'step' | 'mistake') => {
    if (!v.puzzle) return;
    const hint = kind === 'step' ? nextStep(v.puzzle, path) : findMistake(v.puzzle, path);
    setTip({ at: here, hint: hint ?? { text: 'No mistakes so far.', cells: [], area: [] } });
    if (hint) void sendAction({ type: 'hint', puzzle: v.index, kind } satisfies ZapAction);
  };

  const solved = v.puzzle !== null && checkPath(v.puzzle, path) === null;
  const key = (line: readonly number[]) => `${v.index}:${line.join(',')}`;

  // A finished line is sent from the move that finishes it; a refused one unlocks the board.
  const draw = (next: number[]) => {
    set(next);
    if (!v.puzzle || checkPath(v.puzzle, next) !== null) return;
    setSent(key(next));
    setRefused(false);
    void sendAction({ type: 'solve', puzzle: v.index, path: next } satisfies ZapAction).then(
      (ok) => {
        if (!ok) setRefused(true);
      },
    );
  };
  const locked = solved && sent === key(path) && !refused;

  // The line goes to the server a moment after you stop drawing, so anyone who has finished can
  // watch you (and the TV can show how far you are). The finished line goes on its own.
  const lineKey = path.join(',');
  const serverKey = v.mine.join(',');
  useEffect(() => {
    if (!v.puzzle || solved || lineKey === serverKey) return;
    const t = setTimeout(() => {
      const line = lineKey ? lineKey.split(',').map(Number) : [];
      void sendAction({ type: 'progress', puzzle: v.index, path: line } satisfies ZapAction);
    }, 600);
    return () => clearTimeout(t);
  }, [lineKey, serverKey, solved, v.puzzle, v.index, sendAction]);

  const full = v.puzzle !== null && path.length === v.size * v.size && !solved;

  const order = ranking(v);
  const myPlace = order.indexOf(v.me);
  const doneAll = v.index >= v.count;
  const took = (v.times[v.me]?.at(-1) ?? v.startedAt) - v.startedAt;
  const last = v.times[v.me] ?? [];
  const lastMs = last.length ? last.at(-1)! - (last.length > 1 ? last.at(-2)! : v.startedAt) : 0;

  const moment =
    fresh !== null && fresh > 0
      ? doneAll
        ? {
            title: solo ? `All ${v.count} solved` : `${place(myPlace)} to finish`,
            detail: solo
              ? `${clock(took)} in all. Your last took ${clock(lastMs)}.`
              : `All ${v.count} in ${clock(took)}.`,
          }
        : {
            title: `Puzzle ${fresh} solved`,
            detail: `${clock(lastMs)}. ${v.count - fresh} to go.`,
          }
      : null;

  const byId = new Map(players.map((p) => [p.id, p]));
  if (doneAll && !solo) {
    return (
      <div className="zp zp--phone zp-watch" data-look={look}>
        <header className="zp-head">
          <p className="zp-head__title">Watching the race</p>
          <span className="zp-clock" aria-label="Your time">
            {clock(took)}
          </span>
        </header>
        <p className="zp-you" role="status">
          <b>{place(myPlace)}</b> You solved all {v.count} in {clock(took)}.{' '}
          {closing !== null
            ? `The race ends in ${clock(closing * 1000)}.`
            : 'Here’s how everyone else is doing.'}
        </p>
        <Spectate count={order.length - 1}>
          {order
            .filter((id) => id !== v.me)
            .map((id) => (
              <PlayerCard
                key={id}
                id={id}
                t={v}
                player={byId.get(id)}
                rank={order.indexOf(id)}
                path={v.watching?.[id] ?? []}
                now={now}
                reactions={reactions}
              />
            ))}
        </Spectate>
        {moment && (
          <VerdictMoment
            key={fresh}
            outcome="win"
            title={moment.title}
            detail={moment.detail}
            emblem={<BoltMark size={44} />}
            onDone={dismiss}
          />
        )}
      </div>
    );
  }

  return (
    <div className="zp zp--phone" data-look={look}>
      <header className="zp-head">
        <p className="zp-head__title">
          {doneAll ? (solo ? 'All solved' : 'Finished') : `Puzzle ${v.index + 1} of ${v.count}`}
        </p>
        <span className="zp-clock" aria-label="Time on this puzzle">
          {doneAll ? clock(took) : clock(now() - v.since)}
        </span>
      </header>
      {closing !== null && !doneAll && (
        <p className="zp-closing" role="status">
          Someone has solved them all. The race ends in {clock(closing * 1000)}.
        </p>
      )}

      <div className={`zp-main${solo ? ' is-solo' : ''}`}>
        <div className="zp-stage">
          {v.puzzle ? (
            <Board
              puzzle={v.puzzle}
              path={path}
              onPath={locked ? undefined : draw}
              solved={locked}
              hint={locked ? null : tip}
              label={`Puzzle ${v.index + 1}, ${v.size} by ${v.size}`}
            />
          ) : (
            <div className="zp-done">
              <BoltMark size={72} />
              <p className="zp-done__line">
                {solo
                  ? `${v.count === 1 ? 'Solved' : `All ${v.count} solved`} in ${clock(took)}.`
                  : `${place(myPlace)}, all ${v.count} in ${clock(took)}.`}
              </p>
            </div>
          )}
        </div>

        <aside className="zp-side">
          {v.puzzle && (
            <div className="zp-tools">
              <Plaque className="zp-tool" onClick={undo} disabled={!canUndo || locked}>
                Undo
              </Plaque>
              <Plaque className="zp-tool" onClick={() => set([])} disabled={locked || !path.length}>
                Clear
              </Plaque>
            </div>
          )}
          {v.hints && v.puzzle && !locked && (
            <div className="zp-tools zp-tools--hints">
              <Plaque className="zp-tool" onClick={() => ask('step')}>
                Hint
              </Plaque>
              <Plaque className="zp-tool" onClick={() => ask('mistake')}>
                Show a mistake
              </Plaque>
            </div>
          )}
          {tip && !locked && (
            <p className={`zp-tip${tip.mistake ? ' is-mistake' : ''}`} role="status">
              {tip.text}
              {helped > 0 && (
                <span className="zp-tip__count">
                  {helped === 1 ? '1 hint' : `${helped} hints`} on this puzzle
                </span>
              )}
            </p>
          )}
          {full && v.puzzle && (
            <p className="zp-hint" role="status">
              Not quite: {checkPath(v.puzzle, path)}
            </p>
          )}
          {solo ? (
            v.puzzle && (
              <p className="zp-rules">
                Start on 1 and draw one line through every square, through the numbers in order,
                ending on the last. It can&rsquo;t cross itself or go through a wall.
              </p>
            )
          ) : (
            <Race t={v} players={players} me={v.me} now={now} reactions={reactions} />
          )}
        </aside>
      </div>

      {moment && (
        <VerdictMoment
          key={fresh}
          outcome="win"
          title={moment.title}
          detail={moment.detail}
          ms={doneAll ? 3400 : 1600}
          emblem={<BoltMark size={44} />}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
