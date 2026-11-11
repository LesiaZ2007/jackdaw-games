'use client';

import type { CSSProperties } from 'react';
import { Token, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { DEFAULT_HOUSE, cardName, houseValue } from '../cards';
import type { CambioReveal } from '../rules';
import { GameCard, HouseContext } from './pieces';
import { num } from './logic';
import { HandsList, HouseRules } from './table';
import './cambio.css';

/**
 * The final ranking as a score pad: a row for each player, lowest first, a column for each round,
 * and the total. The caller of a round has their score boxed. `cards` adds each player's last
 * hand, face up, to the row (the TV).
 */
function ScorePad({
  rv,
  players,
  me,
  cards,
}: {
  rv: CambioReveal;
  players: ScreenPlayer[];
  me?: string | null;
  cards?: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <table className={`cmb-pad${cards ? ' cmb-pad--cards' : ''}`}>
      <caption className="jd-label">Score pad · lowest wins</caption>
      <thead>
        <tr>
          <th scope="col">Player</th>
          {cards && <th scope="col">Last hand</th>}
          {rv.history.map((r) => (
            <th key={r.round} scope="col" aria-label={`Round ${r.round}`}>
              {r.round}
            </th>
          ))}
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {rv.players.map((id, i) => {
          const p = byId.get(id);
          const nm = id === me ? 'You' : (p?.name ?? 'Someone');
          return (
            <tr key={id} className={id === me ? 'is-me' : undefined}>
              <th scope="row">
                <span className="cmb-pad__who">
                  <span className="cmb-pad__rank">{i + 1}</span>
                  {p && <Token avatar={p.avatar} away={!p.online} />}
                  <span className="cmb-pad__name" title={p?.name}>
                    {nm}
                  </span>
                </span>
              </th>
              {cards && (
                <td className="cmb-pad__hand">
                  {(rv.lastHands[id] ?? []).map((c, s) => (
                    <GameCard
                      key={s}
                      id={c}
                      up
                      label={`${nm}: ${cardName(c)}, worth ${num(houseValue(c, rv.house ?? DEFAULT_HOUSE))}`}
                    />
                  ))}
                </td>
              )}
              {rv.history.map((r) => (
                <td
                  key={r.round}
                  className={r.caller === id ? 'is-call' : undefined}
                  title={r.caller === id ? 'Called Cambio' : undefined}
                >
                  {num(r.scored[id] ?? 0)}
                </td>
              ))}
              <td className="cmb-pad__total">{num(rv.scores[id] ?? 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The results on a phone: the score pad, then everyone's last hand face up. */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players, me }) => {
  const rv = result.reveal as CambioReveal;
  const last = rv.history[rv.history.length - 1];
  return (
    <HouseContext.Provider value={rv.house ?? DEFAULT_HOUSE}>
      <div className="cmb cmb-reveal">
        <section aria-label="Score pad">
          <ScorePad rv={rv} players={players} me={me} />
          <p className="cmb-reveal__note">A boxed score is a Cambio call.</p>
        </section>
        <HouseRules house={rv.house ?? DEFAULT_HOUSE} mode="list" />
        {last && (
          <section aria-label="Last hands">
            <h3 className="jd-label">Last hands, round {last.round}</h3>
            <HandsList
              order={rv.players}
              hands={rv.lastHands}
              players={players}
              me={me}
              caller={last.caller}
              size="reveal"
            />
          </section>
        )}
      </div>
    </HouseContext.Provider>
  );
};

/** The TV's ending: the score pad with every last hand face up in its row. */
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const rv = result.reveal as CambioReveal;
  return (
    <HouseContext.Provider value={rv.house ?? DEFAULT_HOUSE}>
      <div
        className="cmb cmb-reveal cmb-reveal--tv"
        data-count={rv.players.length}
        style={{ '--n': rv.players.length } as CSSProperties}
      >
        <ScorePad rv={rv} players={players} cards />
      </div>
    </HouseContext.Provider>
  );
};
