'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Plaque,
  PlayerReaction,
  Tally,
  Token,
  useCountdown,
  useMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import type { Reaction } from '@jackdaw/engine';
import { RACK, checkPlay, type Placement } from '../board';
import type { Move, WordhoardAction, WordhoardPlayerView, WordhoardTableView } from '../rules';
import { arrange, moveTo } from './arrange';
import { MeaningPopup } from './define';
import { BoardGrid, Tile } from './pieces';
import './wordhoard.css';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** "Rook played HOARD for 24", in words. */
export function moveText(m: Move, name: (id: string) => string): string {
  const who = name(m.player);
  if (m.kind === 'pass') return m.late ? `${who} ran out of time.` : `${who} passed.`;
  if (m.kind === 'swap') return `${who} swapped ${m.count} tile${m.count === 1 ? '' : 's'}.`;
  const words = (m.words ?? []).map((w) => w.word).join(', ');
  return `${who} played ${words} for ${m.score}${m.bingo ? ', all seven tiles' : ''}.`;
}

/** A side's names: "Rook", or "Rook & Jay" (you first, as "You"). */
export function sideName(
  t: WordhoardTableView,
  key: string,
  name: (id: string) => string,
  me?: string,
) {
  const side = t.sides.find((x) => x[0] === key) ?? [key];
  const ids = me && side.includes(me) ? [me, ...side.filter((id) => id !== me)] : side;
  return ids.map((id) => (id === me ? 'You' : name(id))).join(' & ');
}

/** Every side's score, in turn order, with whose turn it is. A pair shows both crests. */
export function Scores({
  t,
  players,
  me,
  reactions,
}: {
  t: WordhoardTableView;
  players: ScreenPlayer[];
  me?: string;
  reactions?: Reaction[];
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const paired = t.sides.some((side) => side.length > 1);
  return (
    <ol className={paired ? 'wh-scores wh-scores--pairs' : 'wh-scores'} aria-label="Scores">
      {t.sides.map((side) => {
        const key = side[0]!;
        const turn = !t.over && t.turn === key;
        return (
          <li key={key} className={turn ? 'is-turn' : undefined}>
            <span className="wh-scores__toks">
              {side.map((id) => {
                const p = byId.get(id);
                return (
                  <span key={id} className="wh-scores__tok">
                    {p && <Token avatar={p.avatar} size={paired ? 28 : 34} away={!p.online} />}
                    <PlayerReaction
                      reactions={reactions}
                      playerId={id}
                      name={p?.name}
                      size={paired ? 28 : 34}
                    />
                  </span>
                );
              })}
            </span>
            <span className="wh-scores__name">
              {(me && side.includes(me) ? [me, ...side.filter((id) => id !== me)] : side).map(
                (id) => (
                  <span key={id}>{id === me ? 'You' : (byId.get(id)?.name ?? 'Someone')}</span>
                ),
              )}
              <small>{turn ? 'Playing' : `${t.rackCounts[key] ?? 0} tiles`}</small>
            </span>
            <Tally className="wh-scores__n" value={t.scores[key] ?? 0} />
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Letterhoard on a phone: the scores, the board, and your rack at the bottom. Tap a tile on your
 * rack, then a square, to place it; tap a placed tile to take it back. The score shows before you
 * play. It fits the screen without scrolling: on a laptop the board takes the left and the rack
 * sits beside it.
 */
/** The turn timer's time left, as "1:05", with a printed tag that turns gules near the end. */
export function TurnClock({ at, now }: { at: number | null; now: () => number }) {
  const left = useCountdown(at, now);
  if (left === null) return null;
  return (
    <span
      className={left <= 10 ? 'wh-clock is-low' : 'wh-clock'}
      aria-label={`${left} seconds left`}
    >
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  );
}

export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  reactions,
  now,
  ...props
}) => {
  const v = view as WordhoardPlayerView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const last = v.moves[v.moves.length - 1];
  const myTurn = v.turn === v.side && !v.over;
  const partner = v.sides.find((x) => x[0] === v.side)?.find((id) => id !== v.me);
  // A word that goes down while you're watching says what it means (not again on a refresh).
  const [fresh, dismiss] = useMoment(v.moves.length);
  // Your order for the rack, as letters, so it lasts from turn to turn.
  const [arranged, setArranged] = useState<string[]>([]);
  const order = arrange(v.rack, arranged);
  const meaning = fresh !== null && last?.kind === 'play' ? last : null;

  return (
    <div className="wh wh--phone">
      <header className="wh__head">
        <h2 className="jd-display">
          {myTurn ? 'Your turn' : `${sideName(v, v.turn, name)}’s turn`}
          <TurnClock at={v.turnBy} now={now} />
        </h2>
        <p>
          {v.bagCount} tile{v.bagCount === 1 ? '' : 's'} in the bag
          {last ? ` · ${moveText(last, (id) => (id === v.me ? 'You' : name(id)))}` : ''}
        </p>
      </header>
      <Scores t={v} players={players} me={v.me} reactions={reactions} />
      {/* Keyed by the move count, so a new turn starts with your tiles back on the rack. Its key
          differs from the meaning popup's below: siblings sharing a key left a stale rack on screen
          after a bot played a word (2026-10-24: "letters appear on top of other letters"). */}
      <Turn
        key={`turn-${v.moves.length}`}
        v={v}
        myTurn={myTurn}
        partner={partner ? name(partner) : undefined}
        send={sendAction}
        order={order}
        setOrder={(o) => setArranged(o.map((i) => v.rack[i]!))}
      />
      {meaning && (
        <MeaningPopup
          key={`meaning-${v.moves.length}`}
          move={meaning}
          who={meaning.player === v.me ? 'You' : name(meaning.player)}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** Words already looked up on this device: true if in the word list. */
const known = new Map<string, boolean>();

/**
 * Which of these words aren't in the word list, asked of the server (the list itself is too big
 * for a phone). Null until the answer is in; an empty list if the lookup fails, since the server
 * checks again on Play anyway.
 */
function useUnknownWords(words: string[] | null): string[] | null {
  const key = words?.join(',') ?? '';
  const [answer, setAnswer] = useState<{ key: string; unknown: string[] } | null>(null);
  const cached = words?.every((w) => known.has(w))
    ? words.filter((w) => known.get(w) === false)
    : null;
  useEffect(() => {
    if (!key || cached) return;
    const ask = key.split(',').filter((w) => !known.has(w));
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/words?w=${encodeURIComponent(ask.join(','))}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((body: { unknown: string[] }) => {
          for (const w of ask) known.set(w, !body.unknown.includes(w));
          setAnswer({ key, unknown: key.split(',').filter((w) => known.get(w) === false) });
        })
        .catch(() => {
          if (!ctl.signal.aborted) setAnswer({ key, unknown: [] });
        });
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [key, cached]);
  if (!words) return null;
  return cached ?? (answer?.key === key ? answer.unknown : null);
}

interface Pending extends Placement {
  /** Which rack tile it came from. */
  from: number;
}

/** Where a dragged tile came from: a rack slot, or a square it was placed on this turn. */
type DragFrom = { rack: number } | { row: number; col: number };
/** Where it was let go: a square on the board, a slot on the rack, or neither. */
type DropAt = { square: [number, number] } | { slot: number } | null;

/**
 * Dragging tiles with a finger or the mouse, alongside tapping: a tile follows the pointer once
 * it has moved a little, the square or rack slot under it is outlined, and letting go calls
 * `onDrop` with where it landed. `justDragged` lets the tap handlers ignore the click a drag
 * ends with.
 */
function useTileDrag(onDrop: (from: DragFrom, at: DropAt) => void) {
  const [drag, setDrag] = useState<{ from: DragFrom; letter: string; x: number; y: number } | null>(
    null,
  );
  const start = useRef<{
    from: DragFrom;
    letter: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const dropRef = useRef(onDrop);
  const justDragged = useRef(false);
  useEffect(() => {
    dropRef.current = onDrop;
  });

  useEffect(() => {
    let hover: Element | null = null;
    const squareAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest('[data-square], [data-slot]') ?? null;
    const mark = (el: Element | null) => {
      if (el === hover) return;
      hover?.classList.remove('is-drop');
      el?.classList.add('is-drop');
      hover = el;
    };
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) return;
      s.moved = true;
      setDrag({ from: s.from, letter: s.letter, x: e.clientX, y: e.clientY });
      mark(squareAt(e.clientX, e.clientY));
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      const s = start.current;
      start.current = null;
      if (!s?.moved) return;
      mark(null);
      setDrag(null);
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 60);
      if (cancelled) return;
      const el = squareAt(e.clientX, e.clientY);
      const square = el?.getAttribute('data-square');
      const slot = el?.getAttribute('data-slot');
      dropRef.current(
        s.from,
        square
          ? { square: square.split(',').map(Number) as [number, number] }
          : slot
            ? { slot: Number(slot) }
            : null,
      );
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  const begin = (e: ReactPointerEvent, from: DragFrom, letter: string) => {
    if (e.button !== 0) return;
    start.current = { from, letter, x: e.clientX, y: e.clientY, moved: false };
  };
  return { drag, begin, justDragged };
}

function Turn({
  v,
  myTurn,
  partner,
  send,
  order,
  setOrder,
}: {
  v: WordhoardPlayerView;
  myTurn: boolean;
  /** Your partner's name, playing in pairs. */
  partner?: string;
  send: (a: WordhoardAction) => Promise<boolean>;
  /** Rack indexes in the order you've arranged them. */
  order: number[];
  setOrder: (order: number[]) => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [blankAt, setBlankAt] = useState<{ row: number; col: number; from: number } | null>(null);
  const [swapping, setSwapping] = useState<number[] | null>(null);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const used = new Set(pending.map((p) => p.from));
  const check = useMemo(
    () => (pending.length ? checkPlay(v.board, pending) : null),
    [pending, v.board],
  );
  const last = v.moves[v.moves.length - 1];
  const unknown = useUnknownWords(check?.ok ? check.words.map((w) => w.word) : null);
  const wrong = unknown && unknown.length > 0;

  const go = async (a: WordhoardAction) => {
    setBusy(true);
    try {
      return await send(a);
    } finally {
      setBusy(false);
    }
  };

  const free = (row: number, col: number) =>
    !v.board[row]![col] && !pending.some((p) => p.row === row && p.col === col);

  /**
   * A rack tile dropped on another rack slot moves there (any time, to plan); dropped on a square
   * it goes on the board (on your turn). A placed tile moves to another square, or back to the
   * rack when it's dropped there or off the board.
   */
  const { drag, begin, justDragged } = useTileDrag((from, at) => {
    if ('rack' in from) {
      if (at && 'slot' in at) return setOrder(moveTo(order, from.rack, at.slot));
      if (!myTurn || !at || !free(...at.square)) return;
      const [row, col] = at.square;
      const letter = v.rack[from.rack]!;
      if (letter === '?') return setBlankAt({ row, col, from: from.rack });
      setPending([...pending, { row, col, letter, from: from.rack }]);
      setPicked(null);
      return;
    }
    const here = pending.find((p) => p.row === from.row && p.col === from.col);
    if (!here) return;
    if (!at || 'slot' in at) return setPending(pending.filter((p) => p !== here));
    if (!free(...at.square)) return;
    const [row, col] = at.square;
    setPending(pending.map((p) => (p === here ? { ...p, row, col } : p)));
  });
  const dragging = (p: { row: number; col: number }) =>
    Boolean(drag && 'row' in drag.from && drag.from.row === p.row && drag.from.col === p.col);

  function onSquare(row: number, col: number) {
    if (!myTurn || justDragged.current) return;
    const here = pending.find((p) => p.row === row && p.col === col);
    if (here) {
      setPending(pending.filter((p) => p !== here));
      return;
    }
    if (picked === null) return;
    const letter = v.rack[picked]!;
    if (letter === '?') {
      setBlankAt({ row, col, from: picked });
      return;
    }
    setPending([...pending, { row, col, letter, from: picked }]);
    setPicked(null);
  }

  function onRack(i: number) {
    if (justDragged.current) return;
    if (swapping) {
      setSwapping(swapping.includes(i) ? swapping.filter((x) => x !== i) : [...swapping, i]);
      return;
    }
    if (!myTurn || used.has(i)) return;
    setPicked(picked === i ? null : i);
  }

  function shuffle() {
    // A fixed reshuffle is enough to see the letters afresh; no randomness needed.
    setOrder(
      [...order.filter((_, i) => i % 2 === 1), ...order.filter((_, i) => i % 2 === 0)].reverse(),
    );
  }

  const status = !myTurn
    ? v.over
      ? 'The game is over.'
      : 'Plan your next word while you wait: drag tiles along the rack to rearrange them.'
    : swapping
      ? `Pick the tiles to swap (${swapping.length} chosen).`
      : check
        ? check.ok
          ? wrong
            ? unknown.length === 1
              ? `${unknown[0]} isn’t in the word list.`
              : `${unknown.join(', ')} aren’t in the word list.`
            : `${check.words.map((w) => w.word).join(', ')}: ${check.score} points${check.bingo ? ', with 50 for all seven' : ''}`
          : check.reason
        : picked !== null
          ? 'Now tap a square on the board.'
          : partner
            ? `Your rack, shared with ${partner}. Either of you can play.`
            : 'Drag a tile onto the board, or tap it and then a square. Drag tiles along the rack to rearrange them.';

  return (
    <>
      <div className="wh-stage">
        <div className={zoom ? 'wh-boardwrap is-zoomed' : 'wh-boardwrap'}>
          <BoardGrid
            board={v.board}
            pending={pending.filter((p) => !dragging(p))}
            recent={last?.cells}
            onSquare={myTurn && !swapping ? onSquare : undefined}
            onPendingDown={(e, row, col) => {
              const p = pending.find((x) => x.row === row && x.col === col);
              if (p) begin(e, { row, col }, p.letter);
            }}
          />
        </div>
      </div>

      <section className="wh-dock" aria-label="Your tiles">
        <p
          className={check && (!check.ok || wrong) ? 'wh-dock__status is-bad' : 'wh-dock__status'}
          role="status"
        >
          {status}
        </p>
        <div className="wh-rack" role="group" aria-label="Your rack">
          {order
            .filter((i) => i < v.rack.length)
            .map((i) => {
              const t = v.rack[i]!;
              const chosen = swapping ? swapping.includes(i) : picked === i;
              return (
                <button
                  key={i}
                  type="button"
                  className={[
                    'wh-rack__slot',
                    chosen && 'is-picked',
                    used.has(i) && 'is-used',
                    drag && 'rack' in drag.from && drag.from.rack === i && 'is-dragging',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={chosen}
                  aria-label={t === '?' ? 'Blank tile' : t}
                  aria-disabled={!myTurn && !swapping}
                  data-slot={i}
                  disabled={used.has(i) && !swapping}
                  onClick={() => onRack(i)}
                  onPointerDown={(e) => {
                    // Dragging along the rack rearranges it, even while you wait for your turn.
                    if (!swapping && !used.has(i)) begin(e, { rack: i }, t);
                  }}
                >
                  <Tile letter={t} />
                </button>
              );
            })}
          {Array.from({ length: Math.max(0, RACK - v.rack.length) }, (_, i) => (
            <span key={`gap-${i}`} className="wh-rack__slot is-empty" aria-hidden="true" />
          ))}
        </div>

        {swapping ? (
          <div className="wh-dock__row">
            <Plaque onClick={() => setSwapping(null)}>Cancel</Plaque>
            <Plaque
              go
              disabled={busy || swapping.length === 0}
              onClick={() => void go({ type: 'swap', tiles: swapping.map((i) => v.rack[i]!) })}
            >
              Swap {swapping.length || ''}
            </Plaque>
          </div>
        ) : (
          <div className="wh-dock__row wh-dock__row--4">
            <Plaque small onClick={() => (pending.length ? setPending([]) : shuffle())}>
              {pending.length ? 'Undo' : 'Shuffle'}
            </Plaque>
            <Plaque small onClick={() => setZoom(!zoom)}>
              {zoom ? 'Fit' : 'Zoom'}
            </Plaque>
            {myTurn && pending.length === 0 && (
              <>
                <Plaque
                  small
                  disabled={busy || v.bagCount < RACK}
                  onClick={() => {
                    setPicked(null);
                    setSwapping([]);
                  }}
                  title={v.bagCount < RACK ? 'Fewer than seven tiles left in the bag' : undefined}
                >
                  Swap
                </Plaque>
                <Plaque small disabled={busy} onClick={() => void go({ type: 'pass' })}>
                  Pass
                </Plaque>
              </>
            )}
            {myTurn && pending.length > 0 && (
              <Plaque
                go
                small
                className="wh-dock__play"
                disabled={busy || !check?.ok || Boolean(wrong)}
                onClick={() =>
                  void go({
                    type: 'play',
                    tiles: pending.map(({ row, col, letter, blank }) => ({
                      row,
                      col,
                      letter,
                      ...(blank ? { blank: true } : {}),
                    })),
                  })
                }
              >
                {check?.ok && !wrong ? `Play for ${check.score}` : 'Play'}
              </Plaque>
            )}
          </div>
        )}
      </section>

      {drag && (
        <div className="wh-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <Tile letter={drag.letter} />
        </div>
      )}

      {blankAt && (
        <div className="jd-sheet" role="presentation">
          <button
            type="button"
            className="jd-sheet__backdrop"
            aria-label="Cancel"
            onClick={() => setBlankAt(null)}
          />
          <div
            className="jd-sheet__panel wh-blank"
            role="dialog"
            aria-modal="true"
            aria-label="Choose the blank’s letter"
          >
            <h3 className="jd-display">Which letter is the blank?</h3>
            <div className="wh-blank__letters">
              {LETTERS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    setPending([...pending, { ...blankAt, letter: l, blank: true }]);
                    setBlankAt(null);
                    setPicked(null);
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
