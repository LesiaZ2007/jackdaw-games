'use client';

import type { GameUi } from '@jackdaw/ui';
import type { FictionaryReveal } from '../rules';
import { cx, Entry, useBookClass } from './book';
import { catName, fooledLies, names, stageName } from './words';
import './fictionary.css';

/**
 * The end of the game: every card as a page of the book, the truth filled in green, and the lie
 * that fooled the most people under it.
 */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players, me }) => {
  const r = result.reveal as FictionaryReveal;
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => (id === me ? 'you' : (byId.get(id)?.name ?? 'Someone'));
  const cls = useBookClass('fic-glossary');
  return (
    <ol className={cls}>
      {r.history.map((h) => {
        const best = fooledLies(h).at(-1);
        const found = h.entries.find((e) => e.truth)!.pickers;
        return (
          <li key={h.n} className={cx('fic-gloss', h.stage === 3 && 'fic-gloss--final')}>
            <p className="fic-gloss__head">
              <span className={cx('fic-tab', `fic-tab--${h.cat}`)}>{catName(h.cat)}</span>
              <span>
                {stageName(h.stage)} ·{' '}
                {found.length ? `Found by ${names(found, name)}` : 'Nobody found it'}
              </span>
            </p>
            <Entry q={h.q} fill={h.answer} tone="truth" />
            {best && (
              <p className="fic-gloss__fib">
                <span className="fic-stamp fic-stamp--small">Fib</span>“{best.text}”{' '}
                {best.by.length ? `by ${names(best.by, name)}` : 'from the house'} fooled{' '}
                {best.pickers.length}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
};
