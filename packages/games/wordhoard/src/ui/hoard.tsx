'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Token, type ScreenPlayer } from '@jackdaw/ui';
import type { Move } from '../rules';
import { cachedMeaning, playedWords, useDefinitions } from './define';

/**
 * True while the element is wider than a phone's column, which is when the laptop layout is in
 * use (its column is capped at 640px otherwise). It lets the ledger sit inline on a laptop and
 * behind a button on a phone, without the hidden copy asking for meanings.
 */
export function useWide(ref: RefObject<HTMLElement | null>, min = 660): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setWide(e.contentRect.width > min);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, min]);
  return wide;
}

/**
 * The bag, drawn as a small printed drawstring pouch with the count on a card-shaped chit. When
 * the bag is empty the pouch lies flat and the label says so.
 */
export function Pouch({ count }: { count: number }) {
  const empty = count <= 0;
  const label = empty ? 'The bag is empty' : `${count} tile${count === 1 ? '' : 's'} in the bag`;
  return (
    <span className={empty ? 'wh-pouch is-empty' : 'wh-pouch'} role="img" aria-label={label}>
      <svg className="wh-pouch__art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        {empty ? (
          <g>
            <path
              className="wh-pouch__cloth"
              d="M5 37c0-4 8-7 19-7s19 3 19 7-8 6-19 6S5 41 5 37z"
            />
            <path className="wh-pouch__cord-line" d="M30 34c4 0 7 1.6 9 4" />
            <circle className="wh-pouch__cord" cx="39.6" cy="38.4" r="1.8" />
            <path className="wh-pouch__cord-line" d="M14 36c-2 .6-3.6 1.6-4.6 3" />
            <circle className="wh-pouch__cord" cx="8.8" cy="40" r="1.8" />
          </g>
        ) : (
          <g>
            <path
              className="wh-pouch__cloth"
              d="M16 14C8 22 4.6 30 8 38c2.4 5.6 29.6 5.6 32 0 3.4-8 0-16-8-24z"
            />
            <path className="wh-pouch__cloth" d="M16 14c2-4.4 5-5 8-3 3-2 6-1.4 8 3z" />
            <rect className="wh-pouch__cord" x="15" y="13" width="18" height="4.4" />
            <path className="wh-pouch__cord-line" d="M24 17.4c-2 4.6-5 5.6-6 9" />
            <path className="wh-pouch__cord-line" d="M24 17.4c2 4.6 5 5.6 6 9" />
            <circle className="wh-pouch__cord" cx="17.6" cy="27.6" r="1.8" />
            <circle className="wh-pouch__cord" cx="30.4" cy="27.6" r="1.8" />
          </g>
        )}
      </svg>
      <span className="wh-pouch__chit" aria-hidden="true">
        {count}
      </span>
      <span className="wh-pouch__label" aria-hidden="true">
        {empty ? 'The bag is empty' : `tile${count === 1 ? '' : 's'} in the bag`}
      </span>
    </span>
  );
}

/** A small gold seal, pressed on the best word of the game. */
export function GoldSeal() {
  return (
    <svg
      className="wh-seal"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Best word"
      focusable="false"
    >
      <title>Best word</title>
      <circle className="wh-seal__disc" cx="12" cy="12" r="10.4" />
      <circle className="wh-seal__ring" cx="12" cy="12" r="7.6" />
      <path
        className="wh-seal__star"
        d="M12 5.6l1.8 4.1 4.4.4-3.3 2.9 1 4.3L12 15l-3.9 2.3 1-4.3-3.3-2.9 4.4-.4z"
      />
    </svg>
  );
}

function LiveMeaning({ move }: { move: Move }) {
  const defs = useDefinitions(playedWords(move));
  if (!defs) return <span className="wh-ledger__mean is-wait">Looking it up…</span>;
  return <MeaningLine sense={defs[0]?.senses[0]} />;
}

function CachedMeaning({ word }: { word: string }) {
  return <MeaningLine sense={cachedMeaning(word)?.senses[0]} />;
}

function MeaningLine({ sense }: { sense?: { part?: string; text: string } }) {
  if (!sense) return null;
  return (
    <span className="wh-ledger__mean" title={sense.text}>
      {sense.part && <b>{sense.part}</b>}
      {sense.text}
    </span>
  );
}

/**
 * The ledger: a ruled account-book sheet of the words played, newest first. Each line has who
 * played it, the word, its points and one line on what it means. Only the newest word asks for
 * its meaning (the same request the TV's card makes); older lines show what this device already
 * has.
 */
export function Ledger({
  moves,
  players,
  best,
  limit,
  live = true,
  tokenSize = 30,
  flat = false,
  className,
}: {
  moves: Move[];
  players: ScreenPlayer[];
  /** The best play of the game, marked with a gold seal. */
  best?: Move | null;
  limit?: number;
  /** Ask for the newest word's meaning (not after the game is over). */
  live?: boolean;
  tokenSize?: number;
  /** No frame of its own (inside a sheet). */
  flat?: boolean;
  className?: string;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const plays = moves
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.kind === 'play' && (m.words?.length ?? 0) > 0)
    .reverse()
    .slice(0, limit);
  const total = moves.filter((m) => m.kind === 'play').length;
  return (
    <section
      className={['wh-ledger', flat && 'wh-ledger--flat', className].filter(Boolean).join(' ')}
      aria-label="Ledger of words played"
    >
      <header className="wh-ledger__head">
        <span>Ledger</span>
        <span>
          {total} word{total === 1 ? '' : 's'}
        </span>
      </header>
      {best?.words?.[0] && (
        <p className="wh-ledger__best">
          <GoldSeal />
          <span>
            Best word: {best.words[0].word}, {best.score}
          </span>
        </p>
      )}
      {plays.length === 0 ? (
        <p className="wh-ledger__empty">No words banked yet. The first has to cover the star.</p>
      ) : (
        <ol className="wh-ledger__list">
          {plays.map(({ m, i }, n) => {
            const p = byId.get(m.player);
            const word = m.words![0]!.word;
            return (
              <li key={i} className={n === 0 ? 'wh-ledger__row is-new' : 'wh-ledger__row'}>
                <span className="wh-ledger__who">
                  {p && <Token avatar={p.avatar} size={tokenSize} title={p.name} />}
                </span>
                <span className="wh-ledger__word">
                  {word}
                  {best === m && <GoldSeal />}
                </span>
                <span className="wh-ledger__pts" aria-label={`${m.score} points`}>
                  {m.score}
                </span>
                {n === 0 && live ? <LiveMeaning move={m} /> : <CachedMeaning word={word} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
