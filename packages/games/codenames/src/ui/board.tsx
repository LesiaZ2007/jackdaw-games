'use client';

import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Token, type ScreenPlayer } from '@jackdaw/ui';
import type { Card } from '../rules';
import { TEAM_NAME } from '../teams';
import { CardMark } from './art';

const vars = (v: Record<string, string | number>) => v as CSSProperties;
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/** How long a word is held before it's guessed. */
export const HOLD_MS = 650;

export const cardLabel = (card: Card) =>
  card === 'bystander'
    ? 'bystander'
    : card === 'assassin'
      ? 'assassin'
      : `${TEAM_NAME[card]} agent`;

/**
 * Tap or hold on a word. A tap is a suggestion (or, when you can't guess, a closer look); holding
 * for HOLD_MS locks the word in as a guess. The finger can slide off to cancel a hold.
 */
function useHold(onTap: (i: number) => void, onHold?: (i: number) => void) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const [holding, setHolding] = useState<number | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(null);
  };
  const handlers = (i: number) => ({
    onPointerDown: (e: PointerEvent) => {
      if (!onHold || e.button !== 0) return;
      held.current = false;
      setHolding(i);
      timer.current = window.setTimeout(() => {
        held.current = true;
        timer.current = null;
        setHolding(null);
        onHold(i);
      }, HOLD_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: { preventDefault(): void }) => onHold && e.preventDefault(),
    onClick: () => {
      if (held.current) {
        held.current = false;
        return;
      }
      onTap(i);
    },
  });
  return { holding, handlers };
}

export interface BoardProps {
  words: string[];
  /** Colours of uncovered words; null while hidden. */
  revealed: (Card | null)[];
  /** The key, for spymasters (and everyone once it's over). */
  keyCards?: Card[] | null;
  /** Operative id -> suggested word. */
  suggestions?: Record<string, number>;
  players: ScreenPlayer[];
  me?: string | null;
  /** The word under the loupe (your suggestion, or the last word tapped). */
  focus?: number | null;
  /** The latest guess, which flips over. Keyed by `guessCount` so only a new one animates. */
  latest?: { index: number; at: number } | null;
  /** Tap a word. Without it the board is read-only. */
  onTap?: (index: number) => void;
  /** Hold a word to guess it (operatives in play only). */
  onHold?: (index: number) => void;
  size?: 'phone' | 'tv' | 'small';
  /** At the end: dim the words nobody found. */
  final?: boolean;
}

/** The 25 index cards. The same board on phones, the TV and the results screen. */
export function Board({
  words,
  revealed,
  keyCards,
  suggestions = {},
  players,
  me,
  focus,
  latest,
  onTap,
  onHold,
  size = 'phone',
  final,
}: BoardProps) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const { holding, handlers } = useHold(onTap ?? (() => {}), onHold);
  const backers = (i: number) =>
    Object.entries(suggestions)
      .filter(([, idx]) => idx === i)
      .map(([id]) => id);

  return (
    <ol
      className={cx('cn-board', `cn-board--${size}`, final && 'cn-board--final')}
      aria-label="The 25 words"
    >
      {words.map((word, i) => {
        const shown = revealed[i] ?? null;
        const keyed = keyCards?.[i] ?? null;
        const who = backers(i);
        const mineSuggested = Boolean(me && suggestions[me] === i);
        const fresh = latest?.index === i;
        const label = [
          word,
          shown ? `uncovered: ${cardLabel(shown)}` : keyed ? `key: ${cardLabel(keyed)}` : null,
          who.length
            ? `suggested by ${who.map((id) => byId.get(id)?.name ?? 'someone').join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join(', ');
        const body = (
          <>
            <span className="cn-card__word" style={vars({ '--len': Math.max(word.length, 5) })}>
              {word}
            </span>
            {keyed && !shown && <span className="cn-card__key" aria-hidden="true" />}
            {who.length > 0 && !shown && (
              <span className="cn-card__votes" aria-hidden="true">
                {who.map((id) => {
                  const p = byId.get(id);
                  return p ? (
                    <Token key={id} avatar={p.avatar} size={size === 'tv' ? 40 : 20} />
                  ) : null;
                })}
              </span>
            )}
            {shown && (
              <span
                key={fresh ? `flip-${latest?.at}` : 'still'}
                className={cx('cn-card__cover', fresh && 'cn-card__cover--fresh')}
                aria-hidden="true"
              >
                <CardMark card={shown} size="42%" />
                <span className="cn-card__covered-word">{word}</span>
              </span>
            )}
            {holding === i && <span className="cn-card__hold" aria-hidden="true" />}
          </>
        );
        const cls = cx(
          'cn-card',
          shown && `is-${shown}`,
          !shown && keyed && `key-${keyed}`,
          (focus === i || mineSuggested) && !shown && 'is-focus',
          who.length > 0 && !shown && 'is-suggested',
          final && !shown && 'is-missed',
        );
        return (
          <li key={i} className="cn-cell">
            {onTap && !shown ? (
              <button
                type="button"
                className={cls}
                aria-label={label}
                aria-pressed={mineSuggested}
                {...handlers(i)}
              >
                {body}
              </button>
            ) : (
              <div className={cls} aria-label={label} role="img">
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
