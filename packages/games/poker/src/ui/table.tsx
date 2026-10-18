'use client';

import type { CSSProperties } from 'react';
import type { Reaction } from '@jackdaw/engine';
import { OutcomeChip, PlayerReaction, Token, type ScreenPlayer } from '@jackdaw/ui';
import type { ActionLine, PokerTableView } from '../rules';
import { ChipStack, PlayingCard, chips } from './pieces';

const ACTION_LABEL: Record<string, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
  allIn: 'All in',
  blind: 'Blind',
};

/** What a player last did this betting round, if anything. */
function lastMove(t: PokerTableView, id: string): ActionLine | undefined {
  const street = t.phase === 'done' || t.phase === 'over' ? null : t.phase;
  for (let i = t.log.length - 1; i >= 0; i--) {
    const l = t.log[i]!;
    if (l.street !== street) break;
    if (l.player === id) return l;
  }
  return undefined;
}

/**
 * The card table seen from above: a green baize oval on a dark rail, the five shared cards and
 * the pot in the middle, and everyone's seat round the rail with their stack, their bet pushed
 * towards the middle, and the button. Whoever is looking sits at the bottom. Shared by the phone
 * and the TV, which only differ in shape and size.
 */
export function PokerTable({
  t,
  players,
  me,
  reactions,
  tv = false,
}: {
  t: PokerTableView;
  players: ScreenPlayer[];
  me?: string;
  reactions?: Reaction[];
  tv?: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const n = t.players.length;
  const start = me && t.players.includes(me) ? t.players.indexOf(me) : 0;
  const order = t.players.map((_, k) => t.players[(start + k) % n]!);
  const done = t.phase === 'done' || t.phase === 'over';
  const last = done ? t.last : null;
  const winners = new Set(last?.pots.flatMap((p) => p.winners) ?? []);
  const best = new Set(Object.values(last?.best ?? {}).flat());

  return (
    <div className={tv ? 'pk-table pk-table--tv' : 'pk-table'} data-count={n}>
      <div className="pk-rail" aria-hidden="true" />
      <div className="pk-felt">
        <div className="pk-board" aria-label="Shared cards">
          {Array.from({ length: 5 }, (_, i) => {
            const c = t.board[i];
            return c ? (
              <PlayingCard
                key={`${t.hand}-${i}`}
                card={c}
                className="pk-deal"
                lift={Boolean(last?.showdown) && best.has(c)}
                dim={Boolean(last?.showdown) && !best.has(c)}
                style={{ animationDelay: `${(i < 3 ? i : 0) * 90}ms` }}
              />
            ) : (
              <span key={i} className="pk-slot" aria-hidden="true" />
            );
          })}
        </div>
        <p className="pk-pot">
          {last ? (
            <>
              {last.pots.map((p, i) => (
                <span key={i} className="pk-pot__line">
                  {p.winners.map(name).join(' and ')} {p.winners.length > 1 ? 'split' : 'wins'}{' '}
                  {chips(p.amount)}
                  <small>{p.hand}</small>
                </span>
              ))}
            </>
          ) : (
            <>
              <span className="jd-label">Pot</span> <b>{chips(t.pot)}</b>
            </>
          )}
        </p>
      </div>

      {order.map((id, k) => {
        const angle = Math.PI + (k / n) * Math.PI * 2;
        const x = 50 + 46 * Math.sin(angle);
        const y = 50 - 45 * Math.cos(angle);
        const bx = 50 + 27 * Math.sin(angle);
        const by = 50 - 25 * Math.cos(angle);
        const p = byId.get(id);
        const out = !t.inHand.includes(id);
        const folded = t.folded.includes(id);
        const move = lastMove(t, id);
        const bet = t.bets[id] ?? 0;
        const shown = last?.shown[id];
        const net = last?.net[id];
        const classes = [
          'pk-seat',
          id === me && 'pk-seat--me',
          t.toAct === id && 'pk-seat--turn',
          (folded || out) && 'pk-seat--out',
          winners.has(id) && 'pk-seat--won',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={id} style={{ display: 'contents' }}>
            <div
              className={classes}
              style={{ left: `${x}%`, top: `${y}%` } as CSSProperties}
              aria-label={`${name(id)}${id === me ? ' (you)' : ''}, ${chips(t.stacks[id] ?? 0)} chips${folded ? ', folded' : ''}${t.toAct === id ? ', to act' : ''}`}
            >
              <span className="pk-seat__tok">
                {p && <Token avatar={p.avatar} away={!p.online} />}
                {t.dealer === id && (
                  <span className="pk-button" title="Dealer button">
                    D
                  </span>
                )}
                <PlayerReaction reactions={reactions} playerId={id} name={name(id)} />
                {shown && shown.length > 0 && (
                  <span className="pk-seat__shown">
                    {shown.map((c) => (
                      <PlayingCard key={c} card={c} lift={best.has(c)} dim={!best.has(c)} />
                    ))}
                  </span>
                )}
                {!shown && !done && !out && !folded && id !== me && (
                  <span className="pk-seat__hidden" aria-hidden="true">
                    <PlayingCard down />
                    <PlayingCard down />
                  </span>
                )}
              </span>
              <span className="pk-seat__name">{id === me ? 'You' : name(id)}</span>
              <span className="pk-seat__stack">
                {out && (t.stacks[id] ?? 0) === 0 ? 'Out' : chips(t.stacks[id] ?? 0)}
              </span>
              {done && net !== undefined && net !== 0 && (
                <OutcomeChip outcome={net > 0 ? 'win' : 'loss'}>
                  {net > 0 ? `+${chips(net)}` : `−${chips(-net)}`}
                </OutcomeChip>
              )}
              {!done && (folded || move || t.allIn.includes(id)) && (
                <span className={`pk-tag${folded ? ' pk-tag--fold' : ''}`}>
                  {folded ? 'Folded' : t.allIn.includes(id) ? 'All in' : ACTION_LABEL[move!.kind]}
                </span>
              )}
            </div>
            {bet > 0 && !done && (
              <ChipStack
                key={`${id}-${bet}`}
                amount={bet}
                className="pk-bet"
                style={{ left: `${bx}%`, top: `${by}%` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
