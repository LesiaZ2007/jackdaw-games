'use client';

import {
  PlayerReaction,
  VerdictMoment,
  useMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import type { CSSProperties } from 'react';
import { awardMoment, robberyMoment } from '../moments';
import type { CatanTableView } from '../rules';
import { RESOURCES } from '../types';
import { CatanBoard } from './board';
import { Clock, Dice, PHASE_LABEL, SeatToken, logLine, namer } from './common';
import { DevGlyph, Pip } from './glyphs';
import { CardRow } from './sheets';
import { seatColour } from './palette';
import './catan.css';
import './tv.css';

/**
 * The TV: the island large, cards flying from each paying tile to its buildings; whose turn it is
 * with the dice; everyone's points, cards, knights and road; what the roll paid and to whom; open
 * offers; and a short log. Public facts only.
 */
export const TvScreen: GameUi['TvScreen'] = ({
  tableView,
  players: shellPlayers,
  now,
  reactions,
}) => {
  const t = tableView as CatanTableView;
  const players = shellPlayers as ScreenPlayer[];
  const name = namer(players);
  const [freshRob, dropRob] = useMoment(t.robbery?.seq ?? 0);
  const [freshAward, dropAward] = useMoment(t.award?.seq ?? 0);
  const rob = freshRob ? robberyMoment(t, null) : null;
  const award = !rob && freshAward ? awardMoment(t, null) : null;
  const who = t.phase === 'robber' ? t.robberBy : t.phase === 'discard' ? null : t.actor;
  const total = t.dice ? t.dice[0] + t.dice[1] : null;
  const paid = Object.entries(t.produced).filter(([, c]) => RESOURCES.some((r) => c[r]));
  const offers = t.phase === 'main' ? t.offers : [];

  return (
    <div className="cn cn--tv">
      <div className="cn-tv__board">
        <CatanBoard
          board={t.board}
          buildings={t.buildings}
          roads={t.roads}
          robber={t.robber}
          seats={t.seats}
          roll={total ? { total, seq: t.rollSeq } : null}
          flyers
          label="The island"
          pad={0.8}
        />
      </div>
      <aside className="cn-tv__side">
        <header className="cn-tv__head">
          <h2>Catan</h2>
          <span>
            {t.phase === 'setup' ? 'Opening placements' : `Round ${t.round}`} · first to {t.target}
          </span>
        </header>
        <section className="cn-tv__turn">
          <SeatToken p={players.find((p) => p.id === (who ?? t.turn))} seats={t.seats} size={84} />
          <p>
            <b>
              {t.phase === 'discard'
                ? 'Discarding'
                : t.paired && t.phase === 'main'
                  ? `${name(who)} builds alongside`
                  : `${name(who)}`}
            </b>
            <small>
              {t.phase === 'discard'
                ? `Waiting for ${Object.keys(t.discards).map(name).join(', ')}`
                : PHASE_LABEL[t.phase]}
            </small>
          </p>
          <Clock at={t.actBy} now={now} />
          <Dice dice={t.dice} seq={t.rollSeq} />
        </section>
        <ol className="cn-tv__players">
          {t.seats.map((id) => {
            const p = players.find((x) => x.id === id);
            const active = id === who;
            return (
              <li
                key={id}
                className={active ? 'cn-tvp is-turn' : 'cn-tvp'}
                style={{ '--cn-own': seatColour(id, t.seats) } as CSSProperties}
              >
                <span className="cn-tvp__tok">
                  <SeatToken p={p} seats={t.seats} size={64} />
                  <PlayerReaction reactions={reactions} playerId={id} name={name(id)} size={64} />
                </span>
                <span className="cn-tvp__body">
                  <span className="cn-tvp__name">{name(id)}</span>
                  <span className="cn-tvp__meta">
                    <span title="Resource cards">
                      <DevGlyph kind="cards" />
                      {t.handCounts[id]}
                    </span>
                    <span title="Development cards">
                      <span className="cn-devchit" aria-hidden="true" />
                      {t.devCounts[id]}
                    </span>
                    <span title="Knights played">
                      <DevGlyph kind="knight" />
                      {t.knights[id]}
                    </span>
                    <span title="Longest road">
                      <DevGlyph kind="longroad" />
                      {t.longest.lengths[id] ?? 0}
                    </span>
                  </span>
                  <span className="cn-tvp__awards">
                    {t.longest.holder === id && <span className="cn-badge">Longest road</span>}
                    {t.army === id && <span className="cn-badge">Largest army</span>}
                  </span>
                </span>
                <span className="cn-tvp__pts">
                  <b>{t.points[id]}</b>
                  <small>points</small>
                </span>
              </li>
            );
          })}
        </ol>
        <section className="cn-tv__news" aria-live="polite">
          {total !== null && (
            <p className="cn-tv__roll">
              <b>Rolled {total}</b>
              {total === 7 ? (
                <span>The robber moves</span>
              ) : paid.length ? (
                paid.map(([id, c]) => (
                  <span key={id} className="cn-tv__gain">
                    {name(id)}
                    {RESOURCES.filter((r) => c[r]).map((r) => (
                      <Pip key={r} res={r} n={c[r]} />
                    ))}
                  </span>
                ))
              ) : (
                <span>Nobody takes anything</span>
              )}
            </p>
          )}
          {offers.map((o) => (
            <p key={o.id} className="cn-tv__offer">
              <b>{name(o.from)}</b> offers <CardRow cards={o.give} /> for <CardRow cards={o.want} />
              {o.to && <span> to {name(o.to)}</span>}
            </p>
          ))}
          <ul className="cn-tv__log">
            {t.log
              .slice(-3)
              .reverse()
              .map((e, i) => (
                <li key={`${t.log.length}-${i}`}>{logLine(e, name)}</li>
              ))}
          </ul>
        </section>
      </aside>
      {(rob || award) && (
        <VerdictMoment
          key={rob ? `r${rob.key}` : `a${award!.key}`}
          size="tv"
          outcome="reveal"
          title={
            rob
              ? `${name(rob.who)} robbed ${name(rob.other)}`
              : `${name(award!.who)} takes ${award!.kind === 'road' ? 'Longest Road' : 'Largest Army'}`
          }
          detail={rob ? 'One card taken' : 'Two more points'}
          onDone={rob ? dropRob : dropAward}
        />
      )}
    </div>
  );
};
