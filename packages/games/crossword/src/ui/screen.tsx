'use client';
import { useEffect, useRef, useState, type KeyboardEvent, type CSSProperties } from 'react';
import { Token, PlayerReaction, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { Reaction } from '@jackdaw/engine';
import type { CrosswordAction, CrosswordView, Cursor } from '../rules';
import type { Clue, Direction } from '../grid';
import { Board, typedLetter } from './board';
import { afterLetter, beforeSquare } from '../navigation';
import './crossword.css';
function useClock(view: CrosswordView, now: () => number) {
  const [time, setTime] = useState(() => now());
  useEffect(() => {
    const id = setInterval(() => setTime(now()), 1000);
    return () => clearInterval(id);
  }, [now]);
  return {
    time,
    elapsed: Math.max(0, Math.floor(((view.finishedAt ?? time) - view.startedAt) / 1000)),
  };
}
function Clock({ seconds }: { seconds: number }) {
  return (
    <>
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </>
  );
}
const clueAt = (view: CrosswordView, cursor: Pick<Cursor, 'cell' | 'direction'>) =>
  view.clues.find((c) => c.direction === cursor.direction && c.cells.includes(cursor.cell));
/** Across clues in number order, then down: the order Tab and the clue bar's arrows follow. */
const inOrder = (clues: Clue[]) => [
  ...clues.filter((c) => c.direction === 'across'),
  ...clues.filter((c) => c.direction === 'down'),
];
function Solvers({
  view,
  players,
  reactions,
  time,
  me,
}: {
  view: CrosswordView;
  players: ScreenPlayer[];
  reactions?: Reaction[];
  time: number;
  me?: string;
}) {
  return (
    <div className="cw-solvers" aria-label="Solving together">
      {players
        .filter((p) => view.players.includes(p.id))
        .map((p) => {
          const cursor = view.cursors[p.id];
          const clue = cursor && time - cursor.at < 30000 ? clueAt(view, cursor) : null;
          return (
            <span
              className="cw-solver"
              key={p.id}
              style={{ '--cw-tint': 'var(--tint-' + p.avatar.tint + ')' } as CSSProperties}
            >
              <Token avatar={p.avatar} size={32} />
              <span>
                <b>
                  {p.name}
                  {p.id === me ? ' · you' : ''}
                </b>
                <small>
                  {view.mode === 'race'
                    ? (view.progress[p.id] ?? 0) + ' squares filled'
                    : !p.online
                      ? 'Away'
                      : clue
                        ? clue.number + ' ' + clue.direction
                        : 'At the grid'}
                </small>
              </span>
              <PlayerReaction playerId={p.id} name={p.name} reactions={reactions} />
            </span>
          );
        })}
    </div>
  );
}
function Masthead({ view, elapsed }: { view: CrosswordView; elapsed: number }) {
  const filled = view.letters.filter(Boolean).length;
  const total = view.blocks.filter((b) => !b).length;
  return (
    <header className="cw-masthead">
      <div className="cw-edition">
        <span>Jackdaw · {view.mode === 'race' ? 'Crossword race' : 'Crossword'}</span>
        <span>
          <Clock seconds={elapsed} />
        </span>
      </div>
      <h1>{view.title}</h1>
      <div className="cw-byline">
        <span>By {view.author}</span>
        <span>
          {filled} / {total} squares · {view.mode === 'race' ? 'your grid' : 'together'}
        </span>
      </div>
    </header>
  );
}
function ClueRow({
  view,
  clue,
  active,
  crossing,
  onChoose,
}: {
  view: CrosswordView;
  clue: Clue;
  active?: Clue;
  crossing?: Clue;
  onChoose?: (clue: Clue) => void;
}) {
  const filled = clue.cells.every((i) => view.letters[i]);
  return (
    <button
      type="button"
      data-clue={clue.id}
      onClick={onChoose ? () => onChoose(clue) : undefined}
      tabIndex={onChoose ? 0 : -1}
      className={[
        'cw-clue',
        active?.id === clue.id && 'cw-clue--active',
        crossing?.id === clue.id && 'cw-clue--crossing',
        filled && 'cw-clue--filled',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <b>{clue.number}</b>
      <span>
        {clue.text} <small>({clue.cells.length})</small>
        {filled && <span className="cw-sr">, filled</span>}
      </span>
    </button>
  );
}
/** Keep a clue row in view inside its own scrolling list, without scrolling the page. */
function scrollClueIntoView(root: HTMLElement | null, id?: string) {
  const row = id ? root?.querySelector<HTMLElement>('[data-clue="' + id + '"]') : null;
  const list = row?.closest<HTMLElement>('section');
  if (!row || !list || list.scrollHeight <= list.clientHeight) return;
  const bounds = list.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  const top = bounds.top + (list.querySelector('h2')?.offsetHeight ?? 0);
  if (box.top < top) list.scrollTop -= top - box.top;
  else if (box.bottom > bounds.bottom) list.scrollTop += box.bottom - bounds.bottom;
}
function Clues({
  view,
  active,
  crossing,
  onChoose,
  open,
}: {
  view: CrosswordView;
  active?: Clue;
  crossing?: Clue;
  onChoose?: (clue: Clue) => void;
  open?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  // Ids, not clue objects: every poll brings new objects, and a reader may be scrolling.
  const activeId = active?.id;
  const crossingId = crossing?.id;
  useEffect(() => {
    scrollClueIntoView(root.current, crossingId);
    scrollClueIntoView(root.current, activeId);
  }, [activeId, crossingId, open]);
  return (
    <div className="cw-clues" ref={root}>
      {(['across', 'down'] as const).map((direction) => (
        <section key={direction}>
          <h2>{direction === 'across' ? 'Across' : 'Down'}</h2>
          {view.clues
            .filter((c) => c.direction === direction)
            .map((c) => (
              <ClueRow
                key={c.id}
                view={view}
                clue={c}
                active={active}
                crossing={crossing}
                onChoose={onChoose}
              />
            ))}
        </section>
      ))}
    </div>
  );
}
/** The TV's clue columns turn a page every 15 seconds; a page is as many whole rows as fit. */
function TvClues({
  view,
  elapsed,
  active,
}: {
  view: CrosswordView;
  elapsed: number;
  active?: Clue;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>([[0], [0]]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let live = true;
    const measure = () => {
      if (!live) return;
      const next = [...element.querySelectorAll<HTMLElement>('.cw-clue-list')].map((list) => {
        const starts = [0];
        for (const row of list.firstElementChild!.children as HTMLCollectionOf<HTMLElement>)
          if (row.offsetTop + row.offsetHeight - starts[starts.length - 1]! > list.clientHeight)
            starts.push(row.offsetTop);
        return starts;
      });
      setPages((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    measure();
    // Rows change height once the web fonts arrive.
    void document.fonts?.ready.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [view.puzzleId, view.clues.length]);
  const turn = Math.floor(elapsed / 15);
  useEffect(() => {
    root.current?.querySelectorAll<HTMLElement>('.cw-clue-list').forEach((list, i) => {
      const starts = pages[i] ?? [0];
      const start = starts[turn % starts.length]!;
      const rows = list.firstElementChild as HTMLElement;
      // A transform, not scrolling: the last page may start nearer the end than a scroll allows.
      rows.style.transform = 'translateY(' + -start + 'px)';
      // A row that only partly fits waits for the next page.
      for (const row of rows.children as HTMLCollectionOf<HTMLElement>)
        row.style.visibility =
          row.offsetTop >= start && row.offsetTop + row.offsetHeight <= start + list.clientHeight
            ? ''
            : 'hidden';
    });
  }, [pages, turn]);
  return (
    <div className="cw-clues" ref={root}>
      {(['across', 'down'] as const).map((direction, i) => {
        const count = pages[i]?.length ?? 1;
        return (
          <section key={direction}>
            <h2>
              {direction === 'across' ? 'Across' : 'Down'}
              {count > 1 ? ' · ' + ((turn % count) + 1) + '/' + count : ''}
            </h2>
            <div className="cw-clue-list">
              <div>
                {view.clues
                  .filter((c) => c.direction === direction)
                  .map((c) => (
                    <ClueRow key={c.id} view={view} clue={c} active={active} />
                  ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
interface Draft {
  letter: string;
  revision: number;
}
type Edit = Extract<CrosswordAction, { type: 'edit' }>;
/** Writes go one at a time, at most every 400ms (under the platform's write limit). */
const WRITE_GAP = 400;
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view: raw,
  me,
  players,
  sendAction,
  now,
  reactions,
}) => {
  const view = raw as CrosswordView;
  const [selected, setSelected] = useState(() => view.clues[0]!.cells[0]!);
  const selectedRef = useRef(selected);
  const rootRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<Direction>('across');
  const [showClues, setShowClues] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [draft, setDraft] = useState<Record<number, Draft>>({});
  const draftRef = useRef<Record<number, Draft>>({});
  const [saving, setSaving] = useState(0);
  const [failure, setFailure] = useState('');
  const outbox = useRef<CrosswordAction[]>([]);
  const pumping = useRef(false);
  const lastSent = useRef(0);
  const inFlight = useRef(0);
  // The pump outlives renders; always send through the newest callback.
  const send = useRef(sendAction);
  useEffect(() => {
    send.current = sendAction;
  }, [sendAction]);
  const { time, elapsed } = useClock(view, now);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      const root = rootRef.current;
      if (root)
        root.style.maxHeight =
          Math.max(300, viewport.height - root.getBoundingClientRect().top - 12) + 'px';
    };
    resize();
    viewport.addEventListener('resize', resize);
    return () => viewport.removeEventListener('resize', resize);
  }, []);
  const fitted = view.width > 5;
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    rootRef.current
      ?.querySelector<HTMLInputElement>('[data-cell="' + selected + '"]')
      ?.focus({ preventScroll: true });
  }, [selected, direction]);
  const active =
    clueAt(view, { cell: selected, direction }) ??
    view.clues.find((c) => c.cells.includes(selected)) ??
    view.clues[0]!;
  const crossing = view.clues.find(
    (c) => c.direction !== active.direction && c.cells.includes(selected),
  );
  const letters = view.letters.map((letter, i) =>
    draft[i] && draft[i]!.revision > view.revisions[i]! ? draft[i]!.letter : letter,
  );
  const unsaved = () => inFlight.current + outbox.current.filter((a) => a.type !== 'focus').length;
  /** Letters typed while a save is in flight go together as one `fill`. */
  function nextWrite(): { action: CrosswordAction; count: number } {
    const first = outbox.current[0]!;
    if (first.type !== 'edit') {
      outbox.current.shift();
      return { action: first, count: first.type === 'focus' ? 0 : 1 };
    }
    let n = 0;
    while (n < outbox.current.length && n < 64 && outbox.current[n]!.type === 'edit') n++;
    const edits = outbox.current.splice(0, n) as Edit[];
    if (edits.length === 1) return { action: first, count: 1 };
    return {
      action: {
        type: 'fill',
        edits: edits.map(({ cell, letter, revision }) => ({ cell, letter, revision })),
        direction: edits[edits.length - 1]!.direction,
      },
      count: edits.length,
    };
  }
  async function pump() {
    if (pumping.current) return;
    pumping.current = true;
    try {
      while (outbox.current.length) {
        const wait = WRITE_GAP - (Date.now() - lastSent.current);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        if (!outbox.current.length) break;
        const { action, count } = nextWrite();
        lastSent.current = Date.now();
        inFlight.current = count;
        let ok: boolean;
        try {
          ok = await send.current(action);
        } catch {
          ok = false;
        }
        inFlight.current = 0;
        if (!ok && action.type !== 'focus') {
          outbox.current = [];
          draftRef.current = {};
          setDraft({});
          setFailure('That edit was not saved. Check the shared grid and try again.');
        }
        setSaving(unsaved());
      }
    } finally {
      pumping.current = false;
      inFlight.current = 0;
      setSaving(unsaved());
    }
  }
  function enqueue(action: CrosswordAction) {
    if (action.type === 'focus') {
      // Nobody else sees a racer's cursor, and one unsent cursor move replaces another.
      if (view.mode === 'race') return;
      outbox.current = outbox.current.filter((a) => a.type !== 'focus');
    } else if (action.type === 'edit') {
      // The edit carries the cursor with it.
      outbox.current = outbox.current.filter((a) => a.type !== 'focus');
    }
    outbox.current.push(action);
    setSaving(unsaved());
    void pump();
  }
  function focus(cell: number, dir: Direction = direction, announce = true) {
    const validDirection = view.clues.some((c) => c.direction === dir && c.cells.includes(cell))
      ? dir
      : view.clues.find((c) => c.cells.includes(cell))!.direction;
    pendingFocus.current = true;
    selectedRef.current = cell;
    setSelected(cell);
    setDirection(validDirection);
    setConfirmReveal(false);
    rootRef.current?.querySelectorAll<HTMLInputElement>('.cw-input').forEach((button) => {
      if (button.getAttribute('data-cell') === String(cell)) button.focus({ preventScroll: true });
    });
    if (announce) enqueue({ type: 'focus', cell, direction: validDirection });
  }
  function choose(clue: Clue) {
    focus(clue.cells.find((i) => !letters[i]) ?? clue.cells[0]!, clue.direction);
    setShowClues(false);
  }
  function nextClue(delta: number) {
    const clues = inOrder(view.clues);
    const at = clues.findIndex((c) => c.id === active.id);
    choose(clues[(at + delta + clues.length) % clues.length]!);
  }
  function current() {
    return view.letters.map((letter, i) =>
      draftRef.current[i] && draftRef.current[i]!.revision > view.revisions[i]!
        ? draftRef.current[i]!.letter
        : letter,
    );
  }
  function edit(letter: string, cell = selected) {
    if (view.revealed.includes(cell) || view.finishedAt !== null) return;
    const before = current();
    const entryClue =
      view.clues.find((c) => c.id === active.id && c.cells.includes(cell)) ??
      clueAt(view, { cell, direction }) ??
      view.clues.find((c) => c.cells.includes(cell))!;
    // Typing over the same letter, or clearing an empty square, only moves on.
    if (before[cell] !== letter) {
      const pending = draftRef.current[cell];
      const revision = Math.max(view.revisions[cell]!, pending?.revision ?? 0);
      draftRef.current = { ...draftRef.current, [cell]: { letter, revision: revision + 1 } };
      setDraft(draftRef.current);
      setFailure('');
      enqueue({ type: 'edit', cell, letter, revision, direction: entryClue.direction });
    }
    const next = afterLetter(view.clues, entryClue.id, before, cell, letter, view.revealed);
    if (next) focus(next.cell, next.direction, false);
  }
  function erase() {
    const filled = current();
    if (filled[selected] && !view.revealed.includes(selected)) {
      edit('', selected);
      return;
    }
    // An empty or revealed square: step back and clear the square before it.
    const back = beforeSquare(view.clues, active.id, selected, view.revealed);
    if (!back) return;
    focus(back.cell, back.direction, false);
    if (filled[back.cell]) edit('', back.cell);
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      [' ', 'Enter', 'Tab'].includes(event.key) &&
      (event.target as HTMLElement).closest('button') &&
      !(event.target as HTMLElement).closest('.cw-cell')
    )
      return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      edit(event.key.toUpperCase());
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      erase();
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      focus(selected, direction === 'across' ? 'down' : 'across');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      nextClue(event.shiftKey ? -1 : 1);
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const dir: Direction =
        event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'across' : 'down';
      // The first press turns to that direction; a square in only one word just moves.
      if (dir !== active.direction && clueAt(view, { cell: selected, direction: dir })) {
        focus(selected, dir);
        return;
      }
      const step =
        event.key === 'ArrowLeft'
          ? -1
          : event.key === 'ArrowRight'
            ? 1
            : event.key === 'ArrowUp'
              ? -view.width
              : view.width;
      let i = selected + step;
      while (
        i >= 0 &&
        i < view.blocks.length &&
        (dir === 'down' || Math.floor(i / view.width) === Math.floor(selected / view.width))
      ) {
        if (!view.blocks[i]) {
          focus(i, dir);
          break;
        }
        i += step;
      }
    }
  }
  const help = view.help && (
    <>
      <button
        type="button"
        disabled={saving > 0}
        onClick={() => enqueue({ type: 'check', cell: selected, direction, scope: 'word' })}
      >
        Check word
      </button>
      <button
        type="button"
        disabled={saving > 0}
        onClick={() => enqueue({ type: 'check', cell: selected, direction, scope: 'puzzle' })}
      >
        Check grid
      </button>
      <button
        type="button"
        disabled={saving > 0}
        onClick={() => {
          if (confirmReveal) {
            enqueue({ type: 'reveal', cell: selected, direction, scope: 'letter' });
            setConfirmReveal(false);
          } else setConfirmReveal(true);
        }}
      >
        {confirmReveal ? 'Confirm reveal' : 'Reveal letter'}
      </button>
    </>
  );
  return (
    <div
      className={'cw cw-player' + (fitted ? ' cw-player--fit' : '')}
      onKeyDown={keyDown}
      ref={rootRef}
    >
      <Masthead view={view} elapsed={elapsed} />
      <Solvers view={view} players={players} reactions={reactions} time={time} me={me} />
      <div className="cw-workspace">
        <div className="cw-grid-wrap">
          <Board
            view={view}
            active={active}
            selected={selected}
            letters={letters}
            onSelect={(cell) => {
              if (cell !== selectedRef.current) focus(cell);
            }}
            onEdit={fitted ? undefined : (cell, letter) => edit(letter, cell)}
          />
        </div>
        <div className={'cw-clue-panel' + (showClues ? ' cw-clue-panel--open' : '')}>
          <button type="button" className="cw-close" onClick={() => setShowClues(false)}>
            Back to grid
          </button>
          <Clues
            view={{ ...view, letters }}
            active={active}
            crossing={crossing}
            onChoose={choose}
            open={showClues}
          />
        </div>
      </div>
      <div className="cw-current">
        <button type="button" aria-label="Previous clue" onClick={() => nextClue(-1)}>
          ‹
        </button>
        <button
          type="button"
          className="cw-current-text"
          onClick={() => focus(selected, direction === 'across' ? 'down' : 'across')}
        >
          <b>
            {active.number} {active.direction}
          </b>
          <span>
            {active.text} ({active.cells.length})
          </span>
        </button>
        <button type="button" aria-label="Next clue" onClick={() => nextClue(1)}>
          ›
        </button>
      </div>
      {fitted && (
        <div className="cw-entry" role="group" aria-label="Active word">
          {active.cells.map((cell) => (
            <input
              key={cell}
              className={
                'cw-input cw-entry-input' +
                (cell === selected ? ' cw-entry-input--selected' : '') +
                (view.errors.includes(cell) ? ' cw-entry-input--error' : '') +
                (view.revealed.includes(cell) ? ' cw-entry-input--revealed' : '')
              }
              data-cell={cell}
              aria-label={
                'Row ' +
                (Math.floor(cell / view.width) + 1) +
                ', column ' +
                ((cell % view.width) + 1) +
                ': ' +
                (letters[cell] || 'empty') +
                (view.errors.includes(cell) ? ', incorrect' : '') +
                (view.revealed.includes(cell) ? ', revealed' : '')
              }
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              value={letters[cell]}
              readOnly={view.revealed.includes(cell)}
              onFocus={(e) => {
                e.currentTarget.select();
                if (cell !== selectedRef.current) focus(cell);
              }}
              onChange={(e) => {
                const letter = typedLetter(e, letters[cell] ?? '');
                if (letter !== null) edit(letter, cell);
              }}
            />
          ))}
        </div>
      )}
      <div className="cw-tools">
        <button type="button" className="cw-all-clues" onClick={() => setShowClues(true)}>
          All clues
        </button>
        {help}
      </div>
      <p className="cw-notice" role="status">
        {failure ||
          (saving
            ? 'Saving ' + saving + ' ' + (saving === 1 ? 'move' : 'moves') + '…'
            : view.notice || 'Tap a square to type · tap the clue bar to turn')}
      </p>
    </div>
  );
};
/** Big grids pan on the TV through a window of whole squares; finished ones tour their pages. */
const TV_CELL = 44;
function TvBoard({ view, active }: { view: CrosswordView; active?: Clue }) {
  const frame = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const lastPan = useRef(0);
  const [span, setSpan] = useState<{ cols: number; rows: number } | null>(null);
  const giant = view.width > 13;
  const cursor = Object.values(view.cursors).sort((a, b) => b.at - a.at)[0];
  const cell = cursor?.cell ?? view.clues[0]?.cells[0] ?? 0;
  useEffect(() => {
    const element = frame.current;
    if (!giant || !element) return;
    const measure = () => {
      const fit = (size: number) =>
        Math.max(1, Math.min(view.width, Math.floor((size - 4) / TV_CELL)));
      const next = { cols: fit(element.clientWidth), rows: fit(element.clientHeight) };
      setSpan((old) => (old && old.cols === next.cols && old.rows === next.rows ? old : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [giant, view.width]);
  useEffect(() => {
    const root = viewport.current;
    if (!root || !span) return;
    // Scroll to whole squares: the board's own 2px border sits before the first one.
    const show = (col: number, row: number) =>
      root.scrollTo({
        left: 2 + Math.max(0, Math.min(col, view.width - span.cols)) * TV_CELL,
        top: 2 + Math.max(0, Math.min(row, view.width - span.rows)) * TV_CELL,
      });
    if (view.finishedAt !== null) {
      const across = Math.ceil(view.width / span.cols);
      const down = Math.ceil(view.width / span.rows);
      let page = 0;
      const turn = () => {
        show((page % across) * span.cols, Math.floor(page / across) * span.rows);
        page = (page + 1) % (across * down);
      };
      turn();
      const id = setInterval(turn, 8000);
      return () => clearInterval(id);
    }
    const pan = () => {
      show(
        (cell % view.width) - Math.floor(span.cols / 2),
        Math.floor(cell / view.width) - Math.floor(span.rows / 2),
      );
      lastPan.current = Date.now();
    };
    const id = setTimeout(pan, Math.max(0, 5000 - (Date.now() - lastPan.current)));
    return () => clearTimeout(id);
  }, [cell, span, view.width, view.finishedAt]);
  return (
    <div className="cw-grid-wrap" ref={frame}>
      {giant ? (
        <div
          className="cw-tv-window"
          ref={viewport}
          style={
            span
              ? { width: span.cols * TV_CELL, height: span.rows * TV_CELL }
              : { visibility: 'hidden' }
          }
        >
          <Board view={view} active={active} />
        </div>
      ) : (
        <Board view={view} active={active} />
      )}
    </div>
  );
}
export const TvScreen: GameUi['TvScreen'] = ({ tableView: raw, players, now, reactions }) => {
  const view = raw as CrosswordView;
  const { time, elapsed } = useClock(view, now);
  // Follow the newest move on the shared grid (a race's grids stay private).
  const latest = Object.values(view.cursors).sort((a, b) => b.at - a.at)[0];
  const active =
    view.mode === 'cooperative' && latest && time - latest.at < 30000
      ? clueAt(view, latest)
      : undefined;
  return (
    <div className={'cw cw-tv' + (view.width > 13 ? ' cw-tv--giant' : '')}>
      <Masthead view={view} elapsed={elapsed} />
      <div className="cw-workspace">
        <TvBoard view={view} active={active} />
        <TvClues view={view} elapsed={elapsed} active={active} />
      </div>
      <Solvers view={view} players={players} reactions={reactions} time={time} />
      <p className="cw-notice">
        {view.mode === 'race'
          ? 'Race grids stay private. Compare the progress counts below.'
          : view.notice || 'Solve together on your phones.'}
        {view.width > 13 ? ' · Board follows the latest entry.' : ''}
      </p>
    </div>
  );
};
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result }) => {
  const view = result.reveal as CrosswordView;
  return (
    <div className={'cw cw-final' + (view.width > 13 ? ' cw-final--giant' : '')}>
      <h2>
        {view.title} · {view.mode === 'race' ? 'race finished' : 'solved together'}
      </h2>
      <div className="cw-workspace">
        <div className="cw-grid-wrap">
          <Board view={view} />
        </div>
        <Clues view={view} />
      </div>
    </div>
  );
};
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result }) => {
  const view = result.reveal as CrosswordView;
  return (
    <div className={'cw cw-tv cw-final' + (view.width > 13 ? ' cw-tv--giant' : '')}>
      <h2>{view.title}</h2>
      <TvBoard view={view} />
    </div>
  );
};
