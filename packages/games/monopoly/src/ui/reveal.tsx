'use client';

import type { CSSProperties } from 'react';
import { Token, useTheme, type GameUi } from '@jackdaw/ui';
import type { MonopolyReveal } from '../rules';
import { money, tintOf } from './board';
import './monopoly.css';

/** After the game: everyone ranked by what they were worth, with the rent they collected. */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const rv = result.reveal as MonopolyReveal;
  const look = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const fallen = [...rv.fallen].reverse();
  const ranked = [
    ...rv.players
      .filter((id) => !rv.fallen.includes(id))
      .sort((a, b) => (rv.worth[b] ?? 0) - (rv.worth[a] ?? 0)),
    ...fallen,
  ];
  return (
    <div className="mnp mnp-reveal" data-look={look}>
      <ol className="mnp-ledger">
        {ranked.map((id, k) => {
          const p = byId.get(id);
          const out = rv.fallen.includes(id);
          const deeds = Object.values(rv.deeds).filter((h) => h.owner === id).length;
          return (
            <li
              key={id}
              className={out ? 'is-out' : ''}
              style={{ '--tint': tintOf(p) } as CSSProperties}
            >
              <span className="mnp-ledger__rank">{k + 1}</span>
              {p && <Token avatar={p.avatar} size={36} />}
              <span className="mnp-ledger__name">
                <b>{p?.name ?? 'Someone'}</b>
                <span>
                  {out ? 'Bankrupt' : `${deeds} ${deeds === 1 ? 'deed' : 'deeds'}`} ·{' '}
                  {money(rv.rent[id] ?? 0)} in rent
                </span>
              </span>
              <span className="mnp-ledger__worth">{out ? '–' : money(rv.worth[id] ?? 0)}</span>
            </li>
          );
        })}
      </ol>
      <p className="mnp-ledger__foot">
        {rv.rounds} {rv.rounds === 1 ? 'round' : 'rounds'} played. Worth counts cash, deeds at their
        price (half if mortgaged) and buildings at cost.
      </p>
    </div>
  );
};
