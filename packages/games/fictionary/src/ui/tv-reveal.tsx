'use client';

import type { GameUi } from '@jackdaw/ui';
import type { CardResult, FictionaryReveal } from '../rules';
import { cx, Entry, useBookClass } from './book';
import { catName, fooledLies, names, stageName } from './words';
import './fictionary.css';

/** The most cards the TV's page of the night has room for. */
const ROOM = 4;

/**
 * The end of the game on the TV (2026-11-16: "make sure there's a game recap"): the night's
 * cards as entries on one page of the book, each with its truth inked in and the lie that fooled
 * the most people stamped under it. Past four cards it keeps the Final Fib and the cards whose
 * lies fooled the most.
 */
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const r = result.reveal as FictionaryReveal;
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const cls = useBookClass('fic-night');
  const cards = pick(r.history);
  return (
    <div className={cls}>
      <h2 className="fic-night__title">The night’s entries</h2>
      <ol className="fic-night__list">
        {cards.map((h) => {
          const best = fooledLies(h).at(-1);
          const found = h.entries.find((e) => e.truth)!.pickers;
          return (
            <li key={h.n} className={cx('fic-night__card', `fic-tab--${h.cat}`)}>
              <p className="fic-night__head">
                <span className="fic-night__no">{h.n}</span>
                <span>
                  {catName(h.cat)} · {stageName(h.stage)}
                </span>
              </p>
              <Entry q={h.q} fill={h.answer} tone="truth" />
              <p className="fic-night__line">
                {found.length ? `Found by ${names(found, name)}` : 'Nobody found it'}
              </p>
              {best && (
                <p className="fic-night__fib">
                  <span className="fic-stamp fic-stamp--small">Fib</span>“{best.text}”{' '}
                  {best.by.length ? `by ${names(best.by, name)}` : 'from the house'} fooled{' '}
                  {best.pickers.length}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** The cards to show, in game order. */
function pick(history: CardResult[]): CardResult[] {
  if (history.length <= ROOM) return history;
  const fooled = (h: CardResult) => Math.max(0, ...fooledLies(h).map((e) => e.pickers.length));
  const final = history.filter((h) => h.stage === 3);
  const rest = history
    .filter((h) => h.stage !== 3)
    .sort((a, b) => fooled(b) - fooled(a) || a.n - b.n)
    .slice(0, ROOM - final.length);
  return [...final, ...rest].sort((a, b) => a.n - b.n);
}
