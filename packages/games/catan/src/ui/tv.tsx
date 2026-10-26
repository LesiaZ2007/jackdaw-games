'use client';

import {
  PlayerReaction,
  VerdictMoment,
  useMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import type { CSSProperties } from 'react';
import { awardMoment, robberyMoment, type Moment } from '../moments';
import type { CatanTableView } from '../rules';
import { RESOURCES } from '../types';
import { CatanBoard } from './board';
import { Clock, Dice, PHASE_LABEL, SeatToken, logLine, namer } from './common';
import { DevGlyph, Pip } from './glyphs';
import { RollMoment } from './roll';
import { CardRow } from './sheets';
import { seatColour } from './palette';
import './catan.css';
import './tv.css';

/** A robbery or an award changing hands, in words for someone who wasn't in it. */
export function revealWords(m: Moment, name: (id: string | null) => string) {
  return m.kind === 'robbery'
    ? { title: `${name(m.who)} robbed ${name(m.other)}`, detail: 'One card taken' }
    : {
        title: `${name(m.who)} takes ${m.kind === 'road' ? 'Longest Road' : 'Largest Army'}`,
        detail: 'Two more points',
      };
}

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
  const [rolling, rolled] = useMoment(t.rollSeq);
  const [freshRob, dropRob] = useMoment(t.robbery?.seq ?? 0);
  const [freshAward, dropAward] = useMoment(t.award?.seq ?? 0);
  const rob = freshRob ? robberyMoment(t, null) : null;
  const award = !rob && freshAward ? awardMoment(t, null) : null;
  const who = t.phase === 'robber' ? t.robberBy : t.phase === 'discard' ? null : t.actor;
  const total = t.dice ? t.dice[0] + t.dice[1] : null;
  const paid = Object.entries(t.produced).filter(([, c]) => RESOURCES.some((r) => c[r]));
  const offers = t.phase === 'main' ? t.offers : [];

  return (
    <div className="ctn ctn--tv">
      <div className="ctn-tv__board">
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
      <aside className="ctn-tv__side">
        <header className="ctn-tv__head">
          <h2>Catan</h2>
          <span>
            {t.phase === 'setup' ? 'Opening placements' : `Round ${t.round}`} · first to {t.target}
          </span>
        </header>
        <section className="ctn-tv__turn">
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
          <Dice dice={t.dice} seq={t.rollSeq} waiting={rolling !== null} />
        </section>
        <ol className="ctn-tv__players" data-count={t.seats.length}>
          {t.seats.map((id) => {
            const p = players.find((x) => x.id === id);
            const active = id === who;
            return (
              <li
                key={id}
                className={active ? 'ctn-tvp is-turn' : 'ctn-tvp'}
                style={{ '--ctn-own': seatColour(id, t.seats) } as CSSProperties}
              >
                <span className="ctn-tvp__tok">
                  <SeatToken p={p} seats={t.seats} size={64} />
                  <PlayerReaction reactions={reactions} playerId={id} name={name(id)} size={64} />
                </span>
                <span className="ctn-tvp__body">
                  <span className="ctn-tvp__name">{name(id)}</span>
                  <span className="ctn-tvp__meta">
                    <span title="Resource cards">
                      <DevGlyph kind="cards" />
                      {t.handCounts[id]}
                    </span>
                    <span title="Development cards">
                      <span className="ctn-devchit" aria-hidden="true" />
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
                  <span className="ctn-tvp__awards">
                    {t.longest.holder === id && <span className="ctn-badge">Longest road</span>}
                    {t.army === id && <span className="ctn-badge">Largest army</span>}
                  </span>
                </span>
                <span className="ctn-tvp__pts">
                  <b>{t.points[id]}</b>
                  <small>points</small>
                </span>
              </li>
            );
          })}
        </ol>
        <section className="ctn-tv__news" aria-live="polite">
          {total !== null && (
            <p className="ctn-tv__roll">
              <b>Rolled {total}</b>
              {total === 7 ? (
                <span>The robber moves</span>
              ) : paid.length ? (
                paid.map(([id, c]) => (
                  <span key={id} className="ctn-tv__gain">
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
            <p key={o.id} className="ctn-tv__offer">
              <b>{name(o.from)}</b> offers <CardRow cards={o.give} /> for <CardRow cards={o.want} />
              {o.to && <span> to {name(o.to)}</span>}
            </p>
          ))}
          <ul className="ctn-tv__log">
            {t.log
              .slice(t.seats.length >= 5 ? -1 : -2)
              .reverse()
              .map((e, i) => (
                <li key={`${t.log.length}-${i}`}>{logLine(e, name)}</li>
              ))}
          </ul>
        </section>
      </aside>
      {rolling !== null && t.dice && (
        <RollMoment
          key={rolling}
          dice={t.dice}
          seq={t.rollSeq}
          target=".ctn-tv__turn .ctn-dice"
          tv
          onDone={rolled}
        />
      )}
      {(rob || award) && (
        <VerdictMoment
          key={rob ? `r${rob.key}` : `a${award!.key}`}
          size="tv"
          outcome="reveal"
          {...revealWords((rob ?? award)!, name)}
          onDone={rob ? dropRob : dropAward}
        />
      )}
    </div>
  );
};
