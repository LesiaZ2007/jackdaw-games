'use client';

import { PlayerReaction, type ScreenPlayer } from '@jackdaw/ui';
import type { CSSProperties } from 'react';
import type { Reaction } from '@jackdaw/engine';
import type { CatanTableView } from '../rules';
import { Awards, Clock, Dice, PHASE_LABEL, SeatToken, namer } from './common';
import { DevGlyph } from './glyphs';
import { seatColour } from './palette';

/** Whose turn it is and what step, the dice, the clock and your points. */
export function TurnStrip({
  t,
  me,
  players,
  now,
  myPoints,
}: {
  t: CatanTableView;
  me: string | null;
  players: ScreenPlayer[];
  now: () => number;
  myPoints: number | null;
}) {
  const name = namer(players);
  const who = t.phase === 'setup' || t.phase === 'robber' || t.phase === 'discard' ? null : t.actor;
  const lead =
    t.phase === 'discard'
      ? Object.keys(t.discards).length === 1
        ? `${t.discards[me ?? ''] ? 'You' : name(Object.keys(t.discards)[0])} must discard`
        : 'Discarding'
      : t.phase === 'robber'
        ? t.robberBy === me
          ? 'Move the robber'
          : `${name(t.robberBy)} moves the robber`
        : t.phase === 'setup'
          ? t.actor === me
            ? 'Your placement'
            : `${name(t.actor)} is placing`
          : who === me
            ? t.paired
              ? 'Your paired turn'
              : 'Your turn'
            : t.paired
              ? `${name(who)} builds alongside`
              : `${name(who)}’s turn`;
  const turnP = players.find((p) => p.id === (who ?? t.actor));
  return (
    <header className="cn-strip">
      <SeatToken p={turnP} seats={t.seats} size={32} />
      <p className="cn-strip__text">
        <b>{lead}</b>
        <small>
          {t.phase === 'setup'
            ? `Round ${t.setup!.step < t.setup!.order.length / 2 ? 1 : 2} of 2`
            : PHASE_LABEL[t.phase]}
          {t.paired && t.phase === 'main' ? ` · ${name(t.turn)}’s turn` : ''}
        </small>
      </p>
      <Clock at={t.actBy} now={now} />
      <Dice dice={t.dice} seq={t.rollSeq} />
      {myPoints !== null && (
        <span className="cn-mypts" title="Your points, with any hidden victory point cards">
          <b>{myPoints}</b>
          <small>/{t.target}</small>
        </span>
      )}
    </header>
  );
}

/** Everyone else: token in their colour, name, cards, development cards, awards and points. */
export function Opponents({
  t,
  me,
  players,
  reactions,
}: {
  t: CatanTableView;
  me: string | null;
  players: ScreenPlayer[];
  reactions: Reaction[];
}) {
  const name = namer(players);
  const others = t.seats.filter((id) => id !== me);
  return (
    <ol className="cn-rail" data-count={others.length}>
      {others.map((id) => {
        const p = players.find((x) => x.id === id);
        const acting =
          t.phase !== 'setup' && (t.actor === id || t.robberBy === id || t.discards[id]);
        return (
          <li
            key={id}
            className={acting ? 'cn-opp is-acting' : 'cn-opp'}
            style={{ '--cn-own': seatColour(id, t.seats) } as CSSProperties}
          >
            <span className="cn-opp__tok">
              <SeatToken p={p} seats={t.seats} size={28} />
              <PlayerReaction reactions={reactions} playerId={id} name={name(id)} size={28} />
            </span>
            <span className="cn-opp__body">
              <span className="cn-opp__name">{name(id)}</span>
              <span className="cn-opp__meta">
                <span title="Resource cards">
                  <DevGlyph kind="cards" />
                  {t.handCounts[id]}
                </span>
                <span title="Development cards">
                  <span className="cn-devchit" aria-hidden="true" />
                  {t.devCounts[id]}
                </span>
                <Awards t={t} id={id} />
              </span>
            </span>
            <span className="cn-opp__pts" aria-label={`${t.points[id]} points`}>
              {t.points[id]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
