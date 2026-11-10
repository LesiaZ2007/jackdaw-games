'use client';

import type { CSSProperties } from 'react';
import { Token, useTheme, type GameUi } from '@jackdaw/ui';
import type { MonopolyReveal, MonopolyTableView } from '../rules';
import { money, tintOf } from './board';
import { DeedCards, notesFor } from './wallet';
import './monopoly.css';
import './tv-reveal.css';

/** A hand of bank notes as a little stack of colored slabs, taller the more cash there is. */
function Stack({ cash }: { cash: number }) {
  const slabs = notesFor(cash).flatMap(({ note, count }) =>
    Array.from({ length: Math.min(count, 3) }, () => note),
  );
  const shown = Math.min(slabs.length, Math.max(1, Math.min(6, Math.ceil(cash / 300))));
  return (
    <span className="mnp-rv__notes" aria-hidden="true">
      {slabs.slice(0, shown).map((note, k) => (
        <span
          key={k}
          className={`mnp-rv__slab mnp-note--${note}`}
          style={{ '--k': k } as CSSProperties}
        />
      ))}
    </span>
  );
}

/**
 * The TV's results for Monopoly: the final accounts. Players ranked on a ledger, each row with
 * their token, name, a stack of notes for their cash, their deeds as mini title-deed cards by
 * color band, houses and hotels, and their net worth. The winner's row is ruled in the win color
 * with a seal; the bankrupt are struck through. It fills the box the platform gives it.
 */
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const rv = result.reveal as MonopolyReveal;
  const look = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const table = { deeds: rv.deeds } as unknown as MonopolyTableView;
  const ranked = [
    ...rv.players
      .filter((id) => !rv.fallen.includes(id))
      .sort(
        (a, b) =>
          Number(rv.winners.includes(b)) - Number(rv.winners.includes(a)) ||
          (rv.worth[b] ?? 0) - (rv.worth[a] ?? 0),
      ),
    ...[...rv.fallen].reverse(),
  ];

  return (
    <div className="mnp mnp-rv" data-look={look}>
      <ol className="mnp-rv__rows" style={{ '--n': ranked.length } as CSSProperties}>
        {ranked.map((id, i) => {
          const p = byId.get(id);
          const out = rv.fallen.includes(id);
          const won = rv.winners.includes(id);
          const mine = Object.values(rv.deeds).filter((h) => h.owner === id);
          const houses = mine
            .filter((h) => h.houses > 0 && h.houses < 5)
            .reduce((n, h) => n + h.houses, 0);
          const hotels = mine.filter((h) => h.houses === 5).length;
          const cash = rv.cash[id] ?? 0;
          return (
            <li
              key={id}
              className={`mnp-rv__row${won ? ' is-winner' : ''}${out ? ' is-out' : ''}`}
              style={{ '--tint': tintOf(p), '--i': i } as CSSProperties}
            >
              {p ? <Token avatar={p.avatar} size={48} /> : <span className="mnp-rv__gone" />}
              <span className="mnp-rv__name">
                <b>{p?.name ?? 'Someone'}</b>
                <span>{out ? 'Out of the game' : `${money(cash)} cash`}</span>
              </span>
              {!out && <Stack cash={cash} />}
              {!out && (
                <span className="mnp-rv__assets">
                  <DeedCards t={table} owner={id} names="classic" size="tv" />
                  {(houses > 0 || hotels > 0) && (
                    <span
                      className="mnp-rv__built"
                      aria-label={`${houses} houses, ${hotels} hotels`}
                    >
                      {houses > 0 && (
                        <span>
                          <i className="mnp-house" />×{houses}
                        </span>
                      )}
                      {hotels > 0 && (
                        <span>
                          <i className="mnp-hotel" />×{hotels}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              )}
              {out ? (
                <span className="mnp-rv__bankrupt">Bankrupt</span>
              ) : (
                <span className="mnp-rv__total">{money(rv.worth[id] ?? 0)}</span>
              )}
              {won && <span className="mnp-rv__seal">Winner</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
