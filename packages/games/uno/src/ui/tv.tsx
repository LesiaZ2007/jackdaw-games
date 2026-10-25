'use client';

import type { CSSProperties } from 'react';
import {
  PlayerReaction,
  Tally,
  Token,
  useMoment,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { COLOUR_NAME, cardName, cardOf } from '../cards';
import type { Move, UnoTableView } from '../rules';
import { roundLine, roundMoment, statusLine, TurnClock } from './player';
import { GameCard } from './pieces';
import { flashOf, seatTags } from './table';
import './uno.css';

/** Most card backs fanned behind a seat; the chit says the real count. */
const FAN_MAX = 10;

/**
 * UNO on the TV, made to be read from the sofa. The table is printed in the colour in play, the
 * discard pile large in the middle with the last few cards scattered under it, and the way play
 * goes in the heading. Everyone sits round it with their real number of card backs
 * fanned out, and whoever plays next is lifted and lit. Action cards stamp their word across the
 * screen, and the play by play runs down the right. Nobody's cards are ever shown.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as UnoTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [fresh, dismiss] = useMoment(t.last?.round ?? 0);
  const moment = fresh !== null ? roundMoment(t, null, name) : null;
  const done = t.phase !== 'play';
  const n = t.players.length;
  const tags = seatTags(t.moves);
  const plays = t.moves.filter((m) => m.kind === 'play');
  const lastPlay = plays[plays.length - 1];
  const lastMove = t.moves[t.moves.length - 1];
  const flash = !done && lastMove?.kind === 'play' ? flashOf(lastMove) : null;
  // The cards under the top one: the plays before it this round, newest last.
  const under = plays.slice(-4, -1);

  return (
    <div
      className={`uno uno-tv uno-tv--${t.colour}`}
      style={{ '--uno-now': `var(--uno-${t.colour})` } as CSSProperties}
    >
      <header className="uno-tv__head">
        <h2 className="jd-display">
          {done
            ? `${t.last ? name(t.last.winner) : 'Someone'} went out`
            : statusLine(t, null, name)}
        </h2>
        {!done && <TurnClock t={t} now={now} />}
        {!done && (
          <span className="uno-tv__colour">
            <span className={`uno-swatch uno-swatch--${t.colour}`} aria-hidden="true" />
            {COLOUR_NAME[t.colour]}
            <span className="uno-tv__dir">{t.dir === 1 ? 'clockwise' : 'anticlockwise'}</span>
          </span>
        )}
        <p>{roundLine(t)}</p>
      </header>

      <div className="uno-tv__table">
        <div className="uno-tv__oval" data-count={n}>
          <div className="uno-tv__felt" aria-hidden="true" />

          <div className="uno-tv__middle">
            <div className="uno-tv__deck" aria-label={`${t.deckCount} cards to draw`} role="img">
              <GameCard down className="uno-tv__under2" />
              <GameCard down className="uno-tv__under1" />
              <GameCard down />
              <span className="uno-tv__deckn">{t.deckCount}</span>
            </div>
            <div className="uno-tv__pile" aria-live="polite">
              {under.map((m, i) => (
                <GameCard
                  key={m.seq}
                  id={m.card}
                  called={m.colour}
                  className="uno-tv__old"
                  style={
                    { '--tilt': `${tilt(m.seq)}deg`, '--k': under.length - i } as CSSProperties
                  }
                />
              ))}
              {t.top !== null && (
                <GameCard
                  key={`${t.round}-${lastPlay?.seq ?? 0}`}
                  id={t.top}
                  called={t.colour}
                  className={lastPlay ? 'uno-tv__top uno-tv__slap' : 'uno-tv__top'}
                  style={{ '--tilt': `${lastPlay ? tilt(lastPlay.seq) : 0}deg` } as CSSProperties}
                  label={`On the pile: ${topName(t)}`}
                />
              )}
            </div>
          </div>

          {t.players.map((id, k) => {
            // Round an ellipse from the bottom, the way play goes.
            const angle = (k / n) * Math.PI * 2;
            const x = 50 - 43 * Math.sin(angle);
            const y = 46 + 35 * Math.cos(angle);
            const p = byId.get(id);
            const count = t.counts[id] ?? 0;
            const fan = Math.min(count, FAN_MAX);
            const tag = tags.get(id);
            const turn = !done && t.toAct === id;
            const won = done && t.last?.winner === id;
            const classes = [
              'uno-tv__seat',
              turn && 'is-turn',
              won && 'is-won',
              !done && count === 1 && 'is-last',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={id}
                className={classes}
                style={{ left: `${x}%`, top: `${y}%` }}
                aria-label={`${name(id)}, ${count} ${count === 1 ? 'card' : 'cards'}${turn ? ', to play' : ''}`}
              >
                <span className="uno-tv__fan" aria-hidden="true">
                  {Array.from({ length: fan }, (_, i) => (
                    <GameCard
                      key={i}
                      down
                      style={
                        { '--r': `${(i - (fan - 1) / 2) * (fan > 6 ? 7 : 10)}deg` } as CSSProperties
                      }
                    />
                  ))}
                </span>
                <span className="uno-tv__tok">
                  {p && <Token avatar={p.avatar} away={!p.online} size={112} />}
                  <PlayerReaction reactions={reactions} playerId={id} name={name(id)} />
                  <span className="uno-tv__count" aria-hidden="true">
                    {count}
                  </span>
                </span>
                <span className="uno-tv__name">
                  {name(id)}
                  {t.target > 0 && (
                    <span className="uno-tv__score" aria-label={`${t.scores[id] ?? 0} points`}>
                      <Tally value={t.scores[id] ?? 0} />
                    </span>
                  )}
                </span>
                {!done && t.called.includes(id) && <span className="uno-tv__call">UNO!</span>}
                {!done && t.uncalled === id && (
                  <span className="uno-tv__call uno-tv__call--open">One card!</span>
                )}
                {tag && !done && (
                  <span key={tag.seq} className={tag.bad ? 'uno-tv__tag is-bad' : 'uno-tv__tag'}>
                    {tag.text}
                  </span>
                )}
                {won && <span className="uno-tv__tag is-won">Out!</span>}
              </div>
            );
          })}

          {flash && (
            <span key={lastMove!.seq} className="uno-tv__flash" aria-hidden="true">
              {flash}
            </span>
          )}
        </div>
      </div>

      <aside className="uno-tv__feed" aria-label="Play by play">
        <h3 className="jd-label">Play by play</h3>
        <ol>
          {t.moves
            .slice(-7)
            .reverse()
            .map((m, i) => (
              <li key={m.seq} className={i === 0 ? 'is-new' : undefined}>
                <span className="uno-tv__mini" aria-hidden="true">
                  {m.kind === 'play' && m.card !== undefined ? (
                    <GameCard id={m.card} called={m.colour} />
                  ) : m.kind === 'draw' || m.kind === 'take' ? (
                    <GameCard down />
                  ) : null}
                </span>
                <span>{feedLine(m, name)}</span>
              </li>
            ))}
        </ol>
        {t.moves.length === 0 && <p className="uno-tv__quiet">The first card is down.</p>}
      </aside>

      {moment && (
        <VerdictMoment
          key={t.last?.round}
          size="tv"
          outcome="reveal"
          title={moment.title}
          detail={moment.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** A slight, steady angle for a card on the pile, so it looks thrown down rather than stacked. */
function tilt(seq: number): number {
  return ((seq * 37) % 23) - 11;
}

function topName(t: UnoTableView): string {
  const wild = cardOf(t.top!).colour === null;
  return wild ? `${cardName(t.top!)}, ${COLOUR_NAME[t.colour]} called` : cardName(t.top!);
}

/** One line of the play by play. */
export function feedLine(m: Move, name: (id: string) => string): string {
  const who = name(m.player);
  const late = m.late ? ' (out of time)' : '';
  switch (m.kind) {
    case 'play': {
      const card = m.card !== undefined ? cardName(m.card) : 'a card';
      const called = m.card !== undefined && cardOf(m.card).colour === null && m.colour;
      return `${who} played ${card}${called ? `, called ${COLOUR_NAME[m.colour!]}` : ''}${late}`;
    }
    case 'draw':
      return m.count
        ? `${who} drew ${m.count === 1 ? 'a card' : m.count}${late}`
        : `${who} found no cards`;
    case 'take':
      return `${who} took ${m.count}${late}`;
    case 'pass':
      return `${who} kept the card${late}`;
    case 'call':
      return `${who} called UNO!`;
    case 'catch':
      return `${who} caught ${m.target ? name(m.target) : 'someone'}: +${m.count}`;
    case 'challenge':
      return m.ok
        ? `${who} challenged and won: ${m.target ? name(m.target) : 'they'} took ${m.count}`
        : `${who} challenged and lost: +${m.count}`;
  }
}
