'use client';

import type { CSSProperties } from 'react';
import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Tally, Token, type ScreenPlayer } from '@jackdaw/ui';
import { COLOUR_NAME, cardName, cardOf } from '../cards';
import type { UnoTableView, Move } from '../rules';
import { GameCard } from './pieces';

/** What the newest moves did to each seat: "Skipped", "+2", "Caught! +2". */
export function seatTags(moves: Move[]): Map<string, { text: string; seq: number; bad: boolean }> {
  const tags = new Map<string, { text: string; seq: number; bad: boolean }>();
  const put = (id: string | undefined, text: string, seq: number, bad = true) => {
    if (id) tags.set(id, { text, seq, bad });
  };
  for (const m of moves.slice(-2)) {
    const face = m.card !== undefined ? cardOf(m.card).face : null;
    if (m.kind === 'play' && (face === 'skip' || (face === 'rev' && m.target)))
      put(m.target, 'Skipped', m.seq);
    if (m.kind === 'take') put(m.player, `+${m.count}`, m.seq);
    if (m.kind === 'draw')
      put(m.player, m.count ? `Drew ${m.count}` : 'No cards left', m.seq, false);
    if (m.kind === 'pass') put(m.player, 'Kept it', m.seq, false);
    if (m.kind === 'catch') put(m.target, `Caught! +${m.count}`, m.seq);
    if (m.kind === 'challenge') {
      if (m.ok) put(m.target, `Bluffed! +${m.count}`, m.seq);
      else put(m.player, `Wrong! +${m.count}`, m.seq);
    }
  }
  return tags;
}

/** The word stamped over the pile when an action card goes down. */
function flashOf(m: Move | undefined): string | null {
  if (!m || m.kind !== 'play' || m.card === undefined) return null;
  const face = cardOf(m.card).face;
  if (face === 'skip') return 'Skip!';
  if (face === 'rev') return 'Reverse!';
  if (face === 'draw2') return '+2!';
  if (face === 'wild4') return '+4!';
  if (face === 'wild') return `${COLOUR_NAME[m.colour ?? 'r']}!`;
  return null;
}

/**
 * The table seen from above: a printed paper mat with the draw pile and the discard pile in the
 * middle, ringed in the colour in play, with arrows turning the way play goes. Everyone sits round
 * the rim with their token, name, how many cards they hold, and their score in a longer game;
 * whoever is looking sits at the bottom. Shared by the phone and the TV.
 */
export function UnoTable({
  t,
  players,
  me,
  reactions,
  tv = false,
  onDraw,
}: {
  t: UnoTableView;
  players: ScreenPlayer[];
  me?: string;
  reactions?: Reaction[];
  tv?: boolean;
  /** Tapping the draw pile draws (on your turn). */
  onDraw?: () => void;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const n = t.players.length;
  const start = me && t.players.includes(me) ? t.players.indexOf(me) : 0;
  const order = t.players.map((_, k) => t.players[(start + k) % n]!);
  const tags = seatTags(t.moves);
  const lastMove = t.moves[t.moves.length - 1];
  const lastPlay = [...t.moves].reverse().find((m) => m.kind === 'play');
  const flash = lastMove && lastMove.kind === 'play' ? flashOf(lastMove) : null;
  const done = t.phase !== 'play';

  return (
    <div
      className={tv ? 'uno-table uno-table--tv' : 'uno-table'}
      data-count={n}
      style={{ '--uno-now': `var(--uno-${t.colour})` } as CSSProperties}
    >
      <div className="uno-mat" aria-hidden="true">
        <svg
          className={t.dir === 1 ? 'uno-arrows' : 'uno-arrows uno-arrows--back'}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <path
              key={i}
              d="M50 4.5l3 2.2-3 2.2"
              transform={`rotate(${i * 60} 50 50)${t.dir === 1 ? '' : ' scale(-1 1) translate(-100 0)'}`}
            />
          ))}
        </svg>
      </div>
      <div className="uno-middle">
        <div className="uno-piles">
          <button
            type="button"
            className="uno-deck"
            onClick={onDraw}
            disabled={!onDraw}
            aria-label={
              onDraw ? `Draw a card (${t.deckCount} left)` : `${t.deckCount} cards to draw`
            }
          >
            <GameCard down className="uno-deck__under" />
            <GameCard down />
            <span className="uno-deck__n">{t.deckCount}</span>
          </button>
          <span className="uno-discard" aria-live="polite">
            {t.top !== null && (
              <GameCard
                key={`${t.round}-${lastPlay?.seq ?? 0}`}
                id={t.top}
                called={t.colour}
                className={lastPlay ? 'uno-land' : undefined}
                label={`On the pile: ${cardOfName(t)}`}
              />
            )}
          </span>
        </div>
        <p className="uno-now">
          <span className={`uno-swatch uno-swatch--${t.colour}`} aria-hidden="true" />
          {done ? `Round ${t.round}` : COLOUR_NAME[t.colour]}
        </p>
        {flash && !done && (
          <span key={lastMove!.seq} className="uno-flash" aria-hidden="true">
            {flash}
          </span>
        )}
      </div>

      {order.map((id, k) => {
        const angle = Math.PI + (k / n) * Math.PI * 2;
        const x = 50 + 46 * Math.sin(angle);
        const y = 50 - 45 * Math.cos(angle);
        const p = byId.get(id);
        const count = t.counts[id] ?? 0;
        const tag = tags.get(id);
        const won = done && t.last?.winner === id;
        const classes = [
          'uno-seat',
          id === me && 'uno-seat--me',
          t.toAct === id && 'uno-seat--turn',
          won && 'uno-seat--won',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={id}
            className={classes}
            style={{ left: `${x}%`, top: `${y}%` }}
            aria-label={`${name(id)}${id === me ? ' (you)' : ''}, ${count} ${count === 1 ? 'card' : 'cards'}${t.toAct === id ? ', to play' : ''}`}
          >
            <span className="uno-seat__tok">
              {p && <Token avatar={p.avatar} away={!p.online} />}
              <PlayerReaction reactions={reactions} playerId={id} name={name(id)} />
              {id !== me && count > 0 && (
                <span className="uno-seat__fan" aria-hidden="true">
                  {Array.from({ length: Math.min(count, 5) }, (_, i) => (
                    <GameCard
                      key={i}
                      down
                      style={{ rotate: `${(i - Math.min(count, 5) / 2) * 9}deg` }}
                    />
                  ))}
                </span>
              )}
              <span className="uno-seat__count" aria-hidden="true">
                {count}
              </span>
            </span>
            <span className="uno-seat__name">
              {id === me ? 'You' : name(id)}
              {t.target > 0 && (
                <span className="uno-seat__score" aria-label={`${t.scores[id] ?? 0} points`}>
                  <Tally value={t.scores[id] ?? 0} />
                </span>
              )}
            </span>
            {!done && t.called.includes(id) && <span className="uno-call">UNO!</span>}
            {!done && t.uncalled === id && (
              <span className="uno-call uno-call--open">One card</span>
            )}
            {tag && !done && (
              <span key={tag.seq} className={tag.bad ? 'uno-tag uno-tag--bad' : 'uno-tag'}>
                {tag.text}
              </span>
            )}
            {won && <span className="uno-tag uno-tag--won">Out!</span>}
          </div>
        );
      })}
    </div>
  );
}

function cardOfName(t: UnoTableView): string {
  const wild = cardOf(t.top!).colour === null;
  return wild ? `${cardName(t.top!)}, ${COLOUR_NAME[t.colour]} called` : cardName(t.top!);
}
