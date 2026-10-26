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
import { checkKings } from '../puzzle';
import { ranking, type KingsAction, type KingsPlayerView } from '../rules';
import { clock } from '../time';
import { Board, KingMark, type Mark } from './board';
import { PlayerCard, Spectate } from './card';
import { place, Race, useTick } from './race';
import './kings.css';

const AUTO_KEY = 'jackdaw:kings:auto';

/** The marks on a puzzle, kept on this device so a refresh doesn't wipe them. */
function useMarks(key: string, cells: number) {
  const read = (): Mark[] => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Mark[] | null;
      if (Array.isArray(saved) && saved.length === cells) return saved;
    } catch {
      // Private browsing or a bad entry: start the board clean.
    }
    return Array<Mark>(cells).fill(0);
  };
  const [state, setState] = useState(() => ({ key, marks: read(), undo: [] as Mark[][] }));
  if (state.key !== key) setState({ key, marks: read(), undo: [] });
  const set = (next: Mark[]) => {
    setState((s) => ({ ...s, marks: next, undo: [...s.undo.slice(-80), s.marks] }));
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Not saved; the board still works.
    }
  };
  const undo = () =>
    setState((s) => {
      const prev = s.undo.at(-1);
      if (!prev) return s;
      try {
        sessionStorage.setItem(key, JSON.stringify(prev));
      } catch {
        // Not saved; the board still works.
      }
      return { ...s, marks: prev, undo: s.undo.slice(0, -1) };
    });
  return { marks: state.marks, set, undo, canUndo: state.undo.length > 0 };
}

function useAuto(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(AUTO_KEY) === '1';
    } catch {
      return false;
    }
  });
  return [
    on,
    (next) => {
      setOn(next);
      try {
        localStorage.setItem(AUTO_KEY, next ? '1' : '0');
      } catch {
        // Only for this visit.
      }
    },
  ];
}

/**
 * Kings on a phone: the puzzle you're on fills the screen, your clock above it, and Undo, Clear
 * and Auto-cross under it with the race beside (on a laptop) or below. A finished board goes to
 * the server by itself; the next puzzle opens once it's counted.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  now,
  reactions,
  ...props
}) => {
  const v = view as KingsPlayerView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const solo = v.players.length === 1;
  const cells = v.size * v.size;
  const { marks, set, undo, canUndo } = useMarks(
    `jackdaw:kings:${v.startedAt}:${v.me}:${v.index}`,
    cells,
  );
  const [auto, setAuto] = useAuto();
  const [sent, setSent] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [fresh, dismiss] = useMoment(v.index);
  const closing = useCountdown(v.closesAt, now);
  useTick();

  const kings = marks.flatMap((m, i) => (m === 2 ? [i] : []));
  const solved = v.puzzle !== null && checkKings(v.puzzle, kings) === null;

  // A finished board is sent from the tap that finishes it; a refused one unlocks the board.
  const board = (marks: readonly Mark[]) =>
    `${v.index}:${marks.flatMap((m, i) => (m === 2 ? [i] : [])).join(',')}`;
  const mark = (next: Mark[]) => {
    set(next);
    const placed = next.flatMap((m, i) => (m === 2 ? [i] : []));
    if (!v.puzzle || checkKings(v.puzzle, placed) !== null) return;
    setSent(board(next));
    setRefused(false);
    void sendAction({ type: 'solve', puzzle: v.index, kings: placed } satisfies KingsAction).then(
      (ok) => {
        if (!ok) setRefused(true);
      },
    );
  };
  const locked = solved && sent === board(marks) && !refused;

  // Where your kings are goes to the server a moment after you stop tapping, so anyone who has
  // finished can watch you (and the TV can count them). The finished board goes on its own.
  const kingsKey = kings.join(',');
  const serverKey = v.mine.join(',');
  useEffect(() => {
    if (!v.puzzle || solved || kingsKey === serverKey) return;
    const t = setTimeout(() => {
      const placed = kingsKey ? kingsKey.split(',').map(Number) : [];
      void sendAction({ type: 'progress', puzzle: v.index, kings: placed } satisfies KingsAction);
    }, 600);
    return () => clearTimeout(t);
  }, [kingsKey, serverKey, solved, v.puzzle, v.index, sendAction]);

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
      <div className="kg kg--phone kg-watch" data-look={look}>
        <header className="kg-head">
          <p className="kg-head__title">Watching the race</p>
          <span className="kg-clock" aria-label="Your time">
            {clock(took)}
          </span>
        </header>
        <p className="kg-you" role="status">
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
                kings={v.watching?.[id] ?? []}
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
            emblem={<KingMark size={44} />}
            onDone={dismiss}
          />
        )}
      </div>
    );
  }

  return (
    <div className="kg kg--phone" data-look={look}>
      <header className="kg-head">
        <p className="kg-head__title">
          {doneAll ? (solo ? 'All solved' : 'Finished') : `Puzzle ${v.index + 1} of ${v.count}`}
        </p>
        <span className="kg-clock" aria-label="Time on this puzzle">
          {doneAll ? clock(took) : clock(now() - v.since)}
        </span>
      </header>
      {closing !== null && !doneAll && (
        <p className="kg-closing" role="status">
          Someone has solved them all. The race ends in {clock(closing * 1000)}.
        </p>
      )}

      <div className={`kg-main${solo ? ' is-solo' : ''}`}>
        <div className="kg-stage">
          {v.puzzle ? (
            <Board
              puzzle={v.puzzle}
              marks={marks}
              onMarks={locked ? undefined : mark}
              auto={auto}
              solved={locked}
              label={`Puzzle ${v.index + 1}, ${v.size} by ${v.size}`}
            />
          ) : (
            <div className="kg-done">
              <KingMark size={72} />
              <p className="kg-done__line">
                {solo
                  ? `${v.count === 1 ? 'Solved' : `All ${v.count} solved`} in ${clock(took)}.`
                  : `${place(myPlace)}, all ${v.count} in ${clock(took)}.`}
              </p>
            </div>
          )}
        </div>

        <aside className="kg-side">
          {v.puzzle && (
            <div className="kg-tools">
              <Plaque className="kg-tool" onClick={undo} disabled={!canUndo || locked}>
                Undo
              </Plaque>
              <Plaque
                className="kg-tool"
                onClick={() => set(Array<Mark>(cells).fill(0))}
                disabled={locked || marks.every((m) => m === 0)}
              >
                Clear
              </Plaque>
              <Plaque
                className="kg-tool kg-switch"
                role="switch"
                aria-checked={auto}
                onClick={() => setAuto(!auto)}
              >
                <span className="kg-switch__box" aria-hidden="true" />
                Auto-cross
              </Plaque>
            </div>
          )}
          {solo ? (
            v.puzzle && (
              <p className="kg-rules">
                One king in every row, every column and every colour. Kings can&rsquo;t touch, not
                even at a corner. Tap once to cross a square out, twice for a king.
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
          emblem={<KingMark size={44} />}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
