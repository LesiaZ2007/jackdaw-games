'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Reaction } from '@jackdaw/engine';
import {
  PlayerReaction,
  Tally,
  Token,
  useCountdown,
  useTheme,
  type ScreenPlayer,
} from '@jackdaw/ui';
import type { CardResult, FictionaryTableView } from '../rules';
import { beatAt, cardLine, catName, names, pts, stageName, statusLine, type Beat } from './words';

/**
 * Fictionary's printed pieces: "The Dictionary of Fibs". A card is set as a dictionary entry,
 * the blank a ruled line; answers are numbered senses; the reveal stamps FIB in red and FACT in
 * green on each slip; scores are the book's index. Shared by the phone and the TV.
 */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** The root class, following the shell's day and dark (dark is the book by lamplight). */
export function useBookClass(extra: string): string {
  const theme = useTheme();
  return cx('fic', theme === 'dark' && 'fic--dark', extra);
}

/** Re-render on a steady beat while `on`, for the reveal's clock. */
export function useTick(on: boolean, ms = 200): void {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [on, ms]);
}

/** Where the reveal on show is right now (null outside a reveal). */
export function useBeat(t: FictionaryTableView, now: () => number): Beat | null {
  const on = t.phase === 'reveal' && !!t.reveal && t.revealAt !== null;
  useTick(on);
  if (!on) return null;
  return beatAt(t.reveal!, now() - t.revealAt!);
}

/** The card as a dictionary entry: the sentence with its blank, filled when there's something to show. */
export function Entry({
  q,
  fill,
  tone,
  className,
}: {
  q: string;
  fill?: string | null;
  /** 'truth' prints the fill in green; 'mine' in pencil (your own draft). */
  tone?: 'truth' | 'mine';
  className?: string;
}) {
  const [before, after] = splitBlank(q);
  return (
    <p className={cx('fic-entry', className)}>
      {before}
      <span className={cx('fic-blank', fill && 'fic-blank--filled', tone && `fic-blank--${tone}`)}>
        {fill || ' '}
      </span>
      {after}
    </p>
  );
}

export function splitBlank(q: string): [string, string] {
  const i = q.indexOf('____');
  if (i < 0) return [q + ' ', ''];
  return [q.slice(0, i), q.slice(i).replace(/^_+/, '')];
}

/** The line over the entry: the tab it's from, the round, and a clock when one runs. */
export function Head({
  t,
  now,
  name,
}: {
  t: FictionaryTableView;
  now: () => number;
  name: (id: string) => string;
}) {
  const at = t.phase === 'reveal' ? null : t.actBy;
  const left = useCountdown(at, now);
  return (
    <header className="fic-head">
      <span className={cx('fic-tab', `fic-tab--${t.play.cat ?? 'blank'}`)}>
        {t.play.cat ? catName(t.play.cat) : stageName(t.play.stage)}
      </span>
      <span className="fic-head__where">
        {t.play.cat ? `${stageName(t.play.stage)} · ` : ''}
        {cardLine(t)}
      </span>
      {left !== null && (
        <span
          className={cx('fic-clock', left <= 10 && 'fic-clock--low')}
          aria-label={`${left} seconds`}
        >
          {left}
        </span>
      )}
      <span className="fic-sr" aria-live="polite">
        {statusLine(t, name)}
      </span>
    </header>
  );
}

/** The thumb-index tabs on offer to the chooser. */
export function TabChoice({
  offer,
  onChoose,
  disabled,
}: {
  offer: string[];
  onChoose?: (tab: string) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="fic-tabs">
      {offer.map((c, i) => (
        <li key={c} style={{ ['--i' as string]: i }}>
          <button
            type="button"
            className={cx('fic-thumb', `fic-tab--${c}`)}
            disabled={disabled || !onChoose}
            onClick={() => onChoose?.(c)}
          >
            <span className="fic-thumb__letter">{catName(c).charAt(0)}</span>
            <span className="fic-thumb__name">{catName(c)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A row of tokens, a tick on those who are done. */
export function Roll({
  ids,
  done,
  players,
  size = 40,
}: {
  ids: string[];
  done?: string[];
  players: Map<string, ScreenPlayer>;
  size?: number;
}) {
  return (
    <ul className="fic-roll">
      {ids.map((id) => {
        const p = players.get(id);
        if (!p) return null;
        const ok = done?.includes(id);
        return (
          <li key={id} className={cx('fic-roll__one', ok && 'fic-roll__one--done')} title={p.name}>
            <Token avatar={p.avatar} size={size} away={!p.online} />
            <span className="fic-roll__name">{p.name}</span>
            {done && <span className="fic-roll__mark" aria-label={ok ? 'done' : 'not yet'} />}
          </li>
        );
      })}
    </ul>
  );
}

/** One beat of the reveal: a slip stamped FIB or FACT, who wrote it and who fell for it. */
export function RevealStage({
  card,
  beat,
  players,
  name,
  me,
  scores,
  likeSlot,
}: {
  card: CardResult;
  scores: Record<string, number>;
  beat: Beat;
  players: Map<string, ScreenPlayer>;
  name: (id: string) => string;
  me?: string | null;
  /** The like button for the slip on show (phones only). */
  likeSlot?: ReactNode;
}) {
  if (beat.kind === 'scores')
    return <ScoreIndex gains={card.gains} scores={scores} players={players} me={me ?? null} />;
  const e = beat.entry;
  const truth = beat.kind === 'truth';
  const gain = truth ? card.stage * 1000 : card.stage * 500 * e.pickers.length;
  return (
    <div
      className={cx('fic-slip', truth ? 'fic-slip--fact' : 'fic-slip--fib')}
      key={`${beat.kind}${e.id}`}
    >
      <p className="fic-slip__text">{e.text}</p>
      <span className="fic-stamp" aria-label={truth ? 'The truth' : 'A lie'}>
        {truth ? 'Fact' : 'Fib'}
      </span>
      <p className="fic-slip__by">
        {truth
          ? e.pickers.length
            ? `Found by ${names(e.pickers, name)}`
            : 'Nobody found it'
          : e.by.length
            ? `Coined by ${names(e.by, name)}`
            : 'A house lie'}
      </p>
      {!truth && (
        <div className="fic-slip__fooled">
          <span className="fic-label">Fell for it</span>
          <Roll ids={e.pickers} players={players} size={36} />
        </div>
      )}
      {truth && e.pickers.length > 0 && <Roll ids={e.pickers} players={players} size={36} />}
      {truth ? (
        <p className="fic-slip__note">
          <span className="fic-label">From the margin</span>
          {card.note}
        </p>
      ) : (
        e.by.length > 0 && (
          <p className="fic-slip__gain">
            +{pts(gain)} {e.by.length > 1 ? 'each' : ''}
          </p>
        )
      )}
      {truth && e.pickers.length > 0 && <p className="fic-slip__gain">+{pts(gain)} each</p>}
      {likeSlot}
    </div>
  );
}

/** The scores as the book's index: ranked, with what this card added. */
export function ScoreIndex({
  gains,
  players,
  me,
  scores,
  reactions,
}: {
  reactions?: Reaction[];
  gains?: Record<string, number>;
  players: Map<string, ScreenPlayer>;
  me: string | null;
  scores: Record<string, number>;
}) {
  const rows = Object.keys(scores).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  return (
    <ol className="fic-index">
      {rows.map((id, i) => {
        const p = players.get(id);
        if (!p) return null;
        const gain = gains?.[id] ?? 0;
        return (
          <li key={id} className={cx('fic-index__row', id === me && 'fic-index__row--me')}>
            <span className="fic-index__rank">{i + 1}</span>
            <span className="fic-index__token">
              <Token avatar={p.avatar} size={30} away={!p.online} />
              {reactions && <PlayerReaction reactions={reactions} playerId={id} name={p.name} />}
            </span>
            <span className="fic-index__name">{p.name}</span>
            <span className="fic-index__dots" aria-hidden="true" />
            {gain > 0 && <span className="fic-index__gain">+{pts(gain)}</span>}
            <Tally value={scores[id] ?? 0} className="fic-index__score" />
          </li>
        );
      })}
    </ol>
  );
}
