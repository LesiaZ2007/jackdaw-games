'use client';
import { useEffect, useRef, useState, type KeyboardEvent, type CSSProperties } from 'react';
import { Token, PlayerReaction, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { Reaction } from '@jackdaw/engine';
import type { CrosswordAction, CrosswordView } from '../rules';
import type { Clue, Direction } from '../grid';
import { Board } from './board';
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
                  {!p.online ? 'Away' : clue ? clue.number + ' ' + clue.direction : 'At the grid'}
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
        <span>Jackdaw · Mini crossword</span>
        <span>
          <Clock seconds={elapsed} />
        </span>
      </div>
      <h1>{view.title}</h1>
      <div className="cw-byline">
        <span>By {view.author}</span>
        <span>
          {filled} / {total} squares · together
        </span>
      </div>
    </header>
  );
}
function Clues({
  view,
  active,
  onChoose,
}: {
  view: CrosswordView;
  active?: Clue;
  onChoose?: (clue: Clue) => void;
}) {
  return (
    <div className="cw-clues">
      {(['across', 'down'] as const).map((direction) => (
        <section key={direction}>
          <h2>{direction === 'across' ? 'Across' : 'Down'}</h2>
          {view.clues
            .filter((c) => c.direction === direction)
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
      ))}
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
  const [selected, setSelected] = useState(0);
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
  const active =
    view.clues.find((c) => c.direction === direction && c.cells.includes(selected)) ??
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
    setSelected(cell);
    setDirection(dir);
    setConfirmReveal(false);
    boardRef.current?.querySelectorAll<HTMLButtonElement>('.cw-cell').forEach((button) => {
      if (button.getAttribute('data-cell') === String(cell)) button.focus();
    });
    if (announce) enqueue({ type: 'focus', cell, direction: dir });
  }
  function choose(clue: Clue) {
    focus(clue.cells.find((i) => !letters[i]) ?? clue.cells[0]!, clue.direction);
    setShowClues(false);
  }
  function nextClue(delta: number) {
    const clues = view.clues.filter((c) => c.direction === direction);
    const at = clues.findIndex((c) => c.id === active.id);
    choose(clues[(at + delta + clues.length) % clues.length]!);
  }
  function edit(letter: string, cell = selected) {
    if (view.revealed.includes(cell) || view.finishedAt !== null) return;
    const pending = draftRef.current[cell];
    const revision = Math.max(view.revisions[cell]!, pending?.revision ?? 0);
    const entry = { letter, revision: revision + 1 };
    draftRef.current = { ...draftRef.current, [cell]: entry };
    setDraft(draftRef.current);
    setFailure('');
    enqueue({ type: 'edit', cell, letter, revision });
    const at = active.cells.indexOf(cell);
    const next = active.cells.slice(at + 1).find((i) => !view.revealed.includes(i));
    if (letter && next !== undefined) focus(next, direction, false);
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
    <div className="cw cw-player" onKeyDown={keyDown}>
      <Masthead view={view} elapsed={elapsed} />
      <Solvers view={view} players={players} reactions={reactions} time={time} me={me} />
      <div className="cw-workspace">
        <div className="cw-grid-wrap" ref={boardRef}>
          <Board
            view={view}
            active={active}
            selected={selected}
            letters={letters}
            onSelect={(cell) =>
              focus(
                cell,
                cell === selected ? (direction === 'across' ? 'down' : 'across') : direction,
              )
            }
          />
        </div>
        <div className={'cw-clue-panel' + (showClues ? ' cw-clue-panel--open' : '')}>
          <button type="button" className="cw-close" onClick={() => setShowClues(false)}>
            Back to grid
          </button>
          <Clues view={view} active={active} onChoose={choose} />
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
      <div className="cw-keyboard" role="group" aria-label="Letter keyboard">
        {[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => (
          <button type="button" key={letter} onClick={() => edit(letter)}>
            {letter}
          </button>
        ))}
        <button type="button" className="cw-erase" aria-label="Erase letter" onClick={erase}>
          ⌫
        </button>
      </div>
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
            : view.notice || 'Type to fill · arrows to move · space to turn · Tab for next clue')}
      </p>
    </div>
  );
};
export const TvScreen: GameUi['TvScreen'] = ({ tableView: raw, players, now, reactions }) => {
  const view = raw as CrosswordView;
  const { time, elapsed } = useClock(view, now);
  return (
    <div className="cw cw-tv">
      <Masthead view={view} elapsed={elapsed} />
      <div className="cw-workspace">
        <div className="cw-grid-wrap">
          <Board view={view} />
        </div>
        <Clues view={view} />
      </div>
      <Solvers view={view} players={players} reactions={reactions} time={time} />
      <p className="cw-notice">{view.notice || 'One grid. Everyone solves on their own phone.'}</p>
    </div>
  );
};
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result }) => {
  const view = result.reveal as CrosswordView;
  return (
    <div className="cw cw-final">
      <h2>{view.title} · solved together</h2>
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
    <div className="cw cw-tv cw-final">
      <h2>{view.title}</h2>
      <div className="cw-grid-wrap">
        <Board view={view} />
      </div>
    </div>
  );
};
