'use client';

import { useEffect, useState } from 'react';
import type { Definition } from '../define';
import type { Move } from '../rules';
import { Tile } from './pieces';

/** Meanings already fetched on this device, by word. */
const meanings = new Map<string, Definition>();

/**
 * What the words of a play mean, from the server (which asks the dictionaries and caches the
 * answer). Null while it's on its way; a word nobody knows comes back with no senses.
 */
export function useDefinitions(words: string[]): Definition[] | null {
  const key = words.join(',');
  const cached = words.every((w) => meanings.has(w)) ? words.map((w) => meanings.get(w)!) : null;
  const [answer, setAnswer] = useState<{ key: string; defs: Definition[] } | null>(null);
  useEffect(() => {
    if (!key || cached) return;
    const ctl = new AbortController();
    fetch(`/api/words/define?w=${encodeURIComponent(key)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { words: Definition[] }) => {
        for (const d of body.words) meanings.set(d.word, d);
        setAnswer({
          key,
          defs: key.split(',').map((w) => meanings.get(w) ?? { word: w, senses: [] }),
        });
      })
      .catch(() => {
        if (!ctl.signal.aborted) {
          setAnswer({ key, defs: key.split(',').map((w) => ({ word: w, senses: [] })) });
        }
      });
    return () => ctl.abort();
  }, [key, cached]);
  if (!key) return [];
  return cached ?? (answer?.key === key ? answer.defs : null);
}

/** The words a play made, the main word first. */
export function playedWords(move: Move | undefined): string[] {
  return move?.kind === 'play' ? (move.words ?? []).map((w) => w.word).slice(0, 4) : [];
}

/** One word's meaning: the part of speech as a small label, then the sense. */
function Meaning({ def, senses = 1 }: { def: Definition; senses?: number }) {
  if (def.senses.length === 0) {
    return (
      <p className="wh-mean__none">Not in the dictionaries we ask, but it’s in the word list.</p>
    );
  }
  return (
    <dl className="wh-mean__senses">
      {def.senses.slice(0, senses).map((s, i) => (
        <div key={i}>
          {s.part && <dt>{s.part}</dt>}
          <dd>{s.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * On a phone, after any play: a card over the board saying what the words mean. It doesn't stop
 * anyone playing; a tap (or the time running out) puts it away.
 */
export function MeaningPopup({
  move,
  who,
  onDone,
}: {
  move: Move;
  /** "Rook", or "You". */
  who: string;
  onDone: () => void;
}) {
  const words = playedWords(move);
  const defs = useDefinitions(words);
  const [main, ...more] = defs ?? [];
  return (
    <div
      className="wh-mean wh-mean--pop"
      role="status"
      onClick={onDone}
      onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
    >
      <button type="button" className="wh-mean__close" aria-label="Close" onClick={onDone}>
        ×
      </button>
      <span className="wh-mean__who">
        {who} played <b>{words[0]}</b> for {move.score}
      </span>
      {!defs ? (
        <span className="wh-mean__wait">Looking it up…</span>
      ) : (
        <>
          {main && <Meaning def={main} />}
          {more.map((d) => (
            <span key={d.word} className="wh-mean__also">
              <b>{d.word}</b> {d.senses[0] ? d.senses[0].text : '(no definition found)'}
            </span>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * On the TV, beside the board: the last word played, in tiles, with what it means (and the other
 * words it made). It stays until the next word goes down.
 */
export function MeaningCard({ move, who }: { move: Move | undefined; who: string }) {
  const words = playedWords(move);
  const defs = useDefinitions(words);
  if (!move || words.length === 0) return null;
  const [main, ...more] = defs ?? [];
  return (
    <section className="wh-mean wh-mean--tv" aria-label={`What ${words[0]} means`}>
      <span className="wh-mean__tiles" aria-hidden="true">
        {[...words[0]!].map((l, i) => (
          <Tile key={i} letter={l} />
        ))}
      </span>
      <span className="wh-mean__who">
        {who}, for {move.score}
      </span>
      {!defs ? (
        <p className="wh-mean__wait">Looking it up…</p>
      ) : (
        <>
          {main && <Meaning def={main} senses={2} />}
          {more.length > 0 && (
            <ul className="wh-mean__more">
              {more.map((d) => (
                <li key={d.word}>
                  <b>{d.word}</b> {d.senses[0] ? d.senses[0].text : '(no definition found)'}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
