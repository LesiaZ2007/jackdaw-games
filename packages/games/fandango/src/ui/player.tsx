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
import { checkBoard, type Puzzle } from '../puzzle';
import { ranking, type FandangoAction, type FandangoPlayerView } from '../rules';
import { clock } from '../time';
import { Board, PairMark } from './board';
import { PlayerCard, Spectate } from './card';
import { place, Race, useTick } from './race';
import './fandango.css';

/** Your marks on a puzzle, kept on this device so a refresh doesn't wipe them. */
function useMarks(key: string) {
  const read = (): number[] => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as number[] | null;
      if (Array.isArray(saved) && saved.every((c) => c === 0 || c === 1 || c === 2)) return saved;
    } catch {
      // Private browsing or a bad entry: start the board clean.
    }
    return [];
  };
  const [state, setState] = useState(() => ({ key, cells: read(), undo: [] as number[][] }));
  if (state.key !== key) setState({ key, cells: read(), undo: [] });
  const save = (cells: number[]) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(cells));
    } catch {
      // Not saved; the board still works.
    }
  };
  const set = (next: number[]) => {
    setState((s) => ({ ...s, cells: next, undo: [...s.undo.slice(-80), s.cells] }));
    save(next);
  };
  const undo = () =>
    setState((s) => {
      const prev = s.undo.at(-1);
      if (!prev) return s;
      save(prev);
      return { ...s, cells: prev, undo: s.undo.slice(0, -1) };
    });
  return { cells: state.cells, set, undo, canUndo: state.undo.length > 0 };
}

/**
 * Fandango on a phone: the puzzle you're on fills the screen, your clock above it, and Undo and Clear
 * under it with the race beside (on a laptop) or below. A finished board goes to the server by
 * itself; the next puzzle opens once it's counted.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  now,
  reactions,
  ...props
}) => {
  const v = view as FandangoPlayerView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const solo = v.players.length === 1;
  const { cells, set, undo, canUndo } = useMarks(
    `jackdaw:fandango:${v.startedAt}:${v.me}:${v.index}`,
  );
  const [sent, setSent] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [fresh, dismiss] = useMoment(v.index);
  const closing = useCountdown(v.closesAt, now);
  useTick();

  const whole = (p: Puzzle, marks: readonly number[]) => p.given.map((g, i) => g || marks[i] || 0);
  const solved = v.puzzle !== null && checkBoard(v.puzzle, whole(v.puzzle, cells)) === null;
  const key = (marks: readonly number[]) => `${v.index}:${marks.join(',')}`;

  // A finished board is sent from the tap that finishes it; a refused one unlocks the board.
  const mark = (next: number[]) => {
    set(next);
    if (!v.puzzle || checkBoard(v.puzzle, whole(v.puzzle, next)) !== null) return;
    setSent(key(next));
    setRefused(false);
    const board = whole(v.puzzle, next);
    void sendAction({ type: 'solve', puzzle: v.index, cells: board } satisfies FandangoAction).then(
      (ok) => {
        if (!ok) setRefused(true);
      },
    );
  };
  const locked = solved && sent === key(cells) && !refused;

  // Your marks go to the server a moment after you stop tapping, so anyone who has finished can
  // watch you (and the TV can show how far you are). The finished board goes on its own.
  const n = v.size * v.size;
  const marksKey = [...Array(n).keys()].map((i) => cells[i] ?? 0).join('');
  const serverKey = [...Array(n).keys()].map((i) => v.mine[i] ?? 0).join('');
  useEffect(() => {
    if (!v.puzzle || solved || marksKey === serverKey) return;
    const t = setTimeout(() => {
      const marks = [...marksKey].map(Number);
      void sendAction({ type: 'progress', puzzle: v.index, cells: marks } satisfies FandangoAction);
    }, 600);
    return () => clearTimeout(t);
  }, [marksKey, serverKey, solved, v.puzzle, v.index, sendAction]);

  const board = v.puzzle ? whole(v.puzzle, cells) : [];
  const full = v.puzzle !== null && !board.includes(0) && !solved;

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
      <div className="fd fd--phone fd-watch" data-look={look}>
        <header className="fd-head">
          <p className="fd-head__title">Watching the race</p>
          <span className="fd-clock" aria-label="Your time">
            {clock(took)}
          </span>
        </header>
        <p className="fd-you" role="status">
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
                cells={v.watching?.[id] ?? []}
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
            emblem={<PairMark size={56} />}
            onDone={dismiss}
          />
        )}
      </div>
    );
  }

  return (
    <div className="fd fd--phone" data-look={look}>
      <header className="fd-head">
        <p className="fd-head__title">
          {doneAll ? (solo ? 'All solved' : 'Finished') : `Puzzle ${v.index + 1} of ${v.count}`}
        </p>
        <span className="fd-clock" aria-label="Time on this puzzle">
          {doneAll ? clock(took) : clock(now() - v.since)}
        </span>
      </header>
      {closing !== null && !doneAll && (
        <p className="fd-closing" role="status">
          Someone has solved them all. The race ends in {clock(closing * 1000)}.
        </p>
      )}

      <div className={`fd-main${solo ? ' is-solo' : ''}`}>
        <div className="fd-stage">
          {v.puzzle ? (
            <Board
              puzzle={v.puzzle}
              cells={cells}
              onCells={locked ? undefined : mark}
              solved={locked}
              label={`Puzzle ${v.index + 1}, ${v.size} by ${v.size}`}
            />
          ) : (
            <div className="fd-done">
              <PairMark size={96} />
              <p className="fd-done__line">
                {solo
                  ? `${v.count === 1 ? 'Solved' : `All ${v.count} solved`} in ${clock(took)}.`
                  : `${place(myPlace)}, all ${v.count} in ${clock(took)}.`}
              </p>
            </div>
          )}
        </div>

        <aside className="fd-side">
          {v.puzzle && (
            <div className="fd-tools">
              <Plaque className="fd-tool" onClick={undo} disabled={!canUndo || locked}>
                Undo
              </Plaque>
              <Plaque
                className="fd-tool"
                onClick={() => set([])}
                disabled={locked || !cells.some(Boolean)}
              >
                Clear
              </Plaque>
            </div>
          )}
          {full && v.puzzle && (
            <p className="fd-hint" role="status">
              Not quite: {checkBoard(v.puzzle, board)}
            </p>
          )}
          {solo ? (
            v.puzzle && (
              <p className="fd-rules">
                Tap a square for a sun, again for a moon. Every row and column has as many suns as
                moons, never three alike in a row; = joins squares that match, × squares that
                differ.
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
          emblem={<PairMark size={56} />}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
