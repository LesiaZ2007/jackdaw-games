'use client';
import { useEffect, useRef, useState, type KeyboardEvent, type CSSProperties } from 'react';
import { Token, PlayerReaction, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { Reaction } from '@jackdaw/engine';
import type { CrosswordAction, CrosswordView } from '../rules';
import type { Clue, Direction } from '../grid';
import { Board } from './board';
import { afterLetter } from '../navigation';
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
          const clue =
            cursor && time - cursor.at < 30000
              ? view.clues.find(
                  (c) => c.direction === cursor.direction && c.cells.includes(cursor.cell),
                )
              : null;
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
function cluePageSize(view: CrosswordView) {
  return view.width > 13 || view.clues.some((c) => c.text.length > 50) ? 4 : 6;
}
function Clues({
  view,
  active,
  onChoose,
  page,
  pageSize = cluePageSize(view),
}: {
  view: CrosswordView;
  active?: Clue;
  onChoose?: (clue: Clue) => void;
  page?: number;
  pageSize?: number;
}) {
  return (
    <div className="cw-clues">
      {(['across', 'down'] as const).map((direction) => {
        const clues = view.clues.filter((c) => c.direction === direction);
        const pages = Math.max(1, Math.ceil(clues.length / pageSize));
        const current = (page ?? 0) % pages;
        return (
          <section key={direction}>
            <h2>
              {direction === 'across' ? 'Across' : 'Down'}
              {page !== undefined && pages > 1 ? ' · ' + (current + 1) + '/' + pages : ''}
            </h2>
            {clues
              .filter((_c, i) => page === undefined || Math.floor(i / pageSize) === current)
              .map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={onChoose ? () => onChoose(c) : undefined}
                  tabIndex={onChoose ? 0 : -1}
                  className={active?.id === c.id ? 'cw-clue cw-clue--active' : 'cw-clue'}
                >
                  <b>{c.number}</b>
                  <span>
                    {c.text} <small>({c.cells.length})</small>
                  </span>
                  {c.cells.every((i) => view.letters[i]) && <span aria-label="Filled">•</span>}
                </button>
              ))}
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
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  const lastSent = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
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
  const [cluePage, setCluePage] = useState(0);
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    rootRef.current
      ?.querySelector<HTMLInputElement>('[data-cell="' + selected + '"]')
      ?.focus({ preventScroll: true });
  }, [selected, direction]);
  const active =
    view.clues.find((c) => c.direction === direction && c.cells.includes(selected)) ??
    view.clues.find((c) => c.cells.includes(selected)) ??
    view.clues[0]!;
  const letters = view.letters.map((letter, i) =>
    draft[i] && draft[i]!.revision > view.revisions[i]! ? draft[i]!.letter : letter,
  );
  function enqueue(action: CrosswordAction) {
    const version = generation.current;
    setSaving((n) => n + 1);
    queue.current = queue.current
      .then(async () => {
        if (version !== generation.current) return;
        // Keep even a fast keyboard below the platform's existing write limit.
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, 400 - (Date.now() - lastSent.current))),
        );
        if (version !== generation.current) return;
        lastSent.current = Date.now();
        let ok: boolean;
        try {
          ok = await sendAction(action);
        } catch {
          ok = false;
        }
        if (!ok) {
          generation.current++;
          draftRef.current = {};
          setDraft({});
          setFailure('That edit was not saved. Check the shared grid and try again.');
        }
      })
      .finally(() => setSaving((n) => Math.max(0, n - 1)));
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
    const clues = view.clues.filter((c) => c.direction === active.direction);
    const at = clues.findIndex((c) => c.id === active.id);
    choose(clues[(at + delta + clues.length) % clues.length]!);
  }
  function edit(letter: string, cell = selected) {
    if (view.revealed.includes(cell) || view.finishedAt !== null) return;
    const before = view.letters.map((letter, i) =>
      draftRef.current[i] && draftRef.current[i]!.revision > view.revisions[i]!
        ? draftRef.current[i]!.letter
        : letter,
    );
    const entryClue =
      view.clues.find((c) => c.id === active.id && c.cells.includes(cell)) ??
      view.clues.find((c) => c.direction === direction && c.cells.includes(cell)) ??
      view.clues.find((c) => c.cells.includes(cell))!;
    const pending = draftRef.current[cell];
    const revision = Math.max(view.revisions[cell]!, pending?.revision ?? 0);
    const entry = { letter, revision: revision + 1 };
    draftRef.current = { ...draftRef.current, [cell]: entry };
    setDraft(draftRef.current);
    setFailure('');
    enqueue({ type: 'edit', cell, letter, revision, direction: entryClue.direction });
    const next = afterLetter(view.clues, entryClue.id, before, cell, letter, view.revealed);
    if (next) focus(next.cell, next.direction, false);
  }
  function erase() {
    const at = active.cells.indexOf(selected);
    const target = letters[selected] ? selected : (active.cells[at - 1] ?? selected);
    edit('', target);
    focus(target, direction, false);
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
      if (dir !== active.direction) {
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
  return (
    <div
      className={'cw cw-player' + (fitted ? ' cw-player--fit' : '')}
      onKeyDown={keyDown}
      ref={rootRef}
    >
      <Masthead view={view} elapsed={elapsed} />
      <Solvers view={view} players={players} reactions={reactions} time={time} me={me} />
      <div className="cw-workspace">
        <div className="cw-grid-wrap" ref={boardRef}>
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
          <Clues view={view} active={active} onChoose={choose} page={cluePage} pageSize={1} />
          <div className="cw-clue-pages">
            <button
              type="button"
              onClick={() => setCluePage((p) => Math.max(0, p - 1))}
              disabled={cluePage === 0}
            >
              Previous clues
            </button>
            <button type="button" onClick={() => setCluePage((p) => p + 1)}>
              Next clues
            </button>
          </div>
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
                'cw-input cw-entry-input' + (cell === selected ? ' cw-entry-input--selected' : '')
              }
              data-cell={cell}
              aria-label={
                'Row ' +
                (Math.floor(cell / view.width) + 1) +
                ', column ' +
                ((cell % view.width) + 1) +
                ': ' +
                (letters[cell] || 'empty')
              }
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              maxLength={1}
              value={letters[cell]}
              readOnly={view.revealed.includes(cell)}
              onFocus={(e) => {
                e.currentTarget.select();
                if (cell !== selectedRef.current) focus(cell);
              }}
              onChange={(e) => {
                const letter = e.currentTarget.value.toUpperCase();
                if (/^[A-Z]?$/.test(letter)) edit(letter, cell);
              }}
            />
          ))}
        </div>
      )}
      <div className="cw-tools">
        <button type="button" onClick={() => setShowClues(true)}>
          All clues
        </button>
        {view.help && (
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
        )}
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
function TvBoard({ view }: { view: CrosswordView }) {
  const viewport = useRef<HTMLDivElement>(null);
  const lastPan = useRef(0);
  const cursor = Object.values(view.cursors).sort((a, b) => b.at - a.at)[0];
  const cell = cursor?.cell ?? view.clues[0]?.cells[0] ?? 0;
  useEffect(() => {
    const root = viewport.current;
    if (!root || view.width <= 13) return;
    if (view.finishedAt !== null) {
      let page = 0;
      const count = Math.ceil(view.width / 12);
      const turn = () => {
        root.scrollTo({ left: (page % count) * 12 * 44, top: Math.floor(page / count) * 12 * 44 });
        page = (page + 1) % (count * count);
      };
      turn();
      const id = setInterval(turn, 8000);
      return () => clearInterval(id);
    }
    const pan = () => {
      root.scrollTo({
        left: Math.max(0, (cell % view.width) * 44 - root.clientWidth / 2),
        top: Math.max(0, Math.floor(cell / view.width) * 44 - root.clientHeight / 2),
      });
      lastPan.current = Date.now();
    };
    const delay = Math.max(0, 5000 - (Date.now() - lastPan.current));
    const id = setTimeout(pan, delay);
    return () => clearTimeout(id);
  }, [cell, view.width, view.finishedAt]);
  return (
    <div className="cw-grid-wrap" ref={viewport}>
      <Board view={view} />
    </div>
  );
}
export const TvScreen: GameUi['TvScreen'] = ({ tableView: raw, players, now, reactions }) => {
  const view = raw as CrosswordView;
  const { time, elapsed } = useClock(view, now);
  const pages = Math.max(
    1,
    ...(['across', 'down'] as const).map((d) =>
      Math.ceil(view.clues.filter((c) => c.direction === d).length / cluePageSize(view)),
    ),
  );
  const page = Math.floor(elapsed / 15) % pages;
  return (
    <div className={'cw cw-tv' + (view.width > 13 ? ' cw-tv--giant' : '')}>
      <Masthead view={view} elapsed={elapsed} />
      <div className="cw-workspace">
        <TvBoard view={view} />
        <Clues view={view} page={page} />
      </div>
      <Solvers view={view} players={players} reactions={reactions} time={time} />
      <p className="cw-notice">
        {view.mode === 'race'
          ? 'Race grids stay private. Compare the progress counts below.'
          : view.notice || 'Solve together on your phones.'}
        {view.width > 13 ? ' · Board follows the latest entry.' : ''}
        {pages > 1 ? ' · Clues turn every 15 seconds.' : ''}
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
