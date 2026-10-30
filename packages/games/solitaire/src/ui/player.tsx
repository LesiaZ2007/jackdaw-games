'use client';

import { useEffect, useState } from 'react';
import {
  Plaque,
  PlayerReaction,
  Token,
  useMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { cardShort, rankOf, type Card } from '../cards';
import {
  canGoUp,
  fits,
  movesFor,
  viewLayout,
  type Move,
  type SeatView,
  type SolitaireAction,
  type SolitairePlayerView,
  type SolitaireTableView,
  type Source,
} from '../rules';
import { Middle, PlayingCard, StockWaste, Tableau, tintOf } from './pieces';
import './solitaire.css';

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** "Wren", "Wren and Rook", "Wren, Rook and Robin". */
export function names(ids: string[], name: (id: string) => string): string {
  const all = ids.map(name);
  return all.length <= 1 ? (all[0] ?? '') : `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`;
}

/**
 * Where a tapped card goes: up to the middle if it can (only a column's bottom card or the
 * waste's), otherwise onto the first column it fits, a column with cards before an empty one.
 */
export function moveFor(
  seat: SeatView,
  foundations: SolitaireTableView['foundations'],
  from: Source,
  card: Card,
): Move | null {
  const top = from === 'waste' ? seat.waste.at(-1) : seat.cols[from]!.up.at(-1);
  if (top === card && canGoUp(foundations, card)) return { type: 'up', from, card };
  const order = seat.cols
    .map((col, to) => ({ col, to }))
    .filter(({ to }) => to !== from)
    .sort((a, b) => Number(a.col.up.length === 0) - Number(b.col.up.length === 0));
  for (const { col, to } of order) {
    if (!fits(col, card)) continue;
    // A king already heading a column of its own gains nothing from moving to another.
    if (from !== 'waste' && rankOf(card) === 13) {
      const src = seat.cols[from]!;
      if (src.down === 0 && src.up[0] === card) continue;
    }
    return { type: 'move', from, card, to };
  }
  return null;
}

/** The move a hint points at: anything going up first, then turning a covered card over. */
export function hintFor(seat: SeatView, t: SolitaireTableView): Move | 'stock' | null {
  const moves = movesFor(viewLayout(seat), t.foundations);
  const best =
    moves.find((m) => m.type === 'up') ??
    moves.find((m) => m.type === 'move' && m.from !== 'waste') ??
    moves[0];
  if (best) return best;
  return seat.stuck ? null : 'stock';
}

/** One line for the head of the screen. */
export function statusLine(t: SolitaireTableView, me: string | null, name: (id: string) => string) {
  if (t.over) return 'Game over';
  const stuck = t.players.filter((id) => t.seats[id]!.stuck);
  const going = t.players.filter((id) => !t.seats[id]!.stuck);
  if (me && t.seats[me]) {
    if (t.seats[me].stuck) {
      const others = going.filter((id) => id !== me);
      return others.length ? `You’re stuck. Waiting on ${names(others, name)}` : 'You’re stuck';
    }
    if (t.players.length > 1 && stuck.length === t.players.length - 1)
      return 'Everyone else is stuck: your move';
    return `${plural(t.seats[me].left, 'card')} to go`;
  }
  if (stuck.length && going.length) return `Waiting on ${names(going, name)}`;
  return 'Everyone’s playing';
}

/** Everyone else (or everyone): crest, name, cards to go, and whether they're stuck. */
export function Rivals({
  t,
  players,
  ids,
  reactions,
}: {
  t: SolitaireTableView;
  players: ScreenPlayer[];
  ids: string[];
  reactions?: Parameters<typeof PlayerReaction>[0]['reactions'];
}) {
  const leader = Math.min(...t.players.map((id) => t.seats[id]!.left));
  return (
    <ul className="sol-rivals">
      {ids.map((id) => {
        const p = players.find((x) => x.id === id);
        const s = t.seats[id]!;
        return (
          <li
            key={id}
            className={[
              'sol-rival',
              s.stuck && 'sol-rival--stuck',
              s.left === leader && t.players.length > 1 && 'sol-rival--lead',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="sol-rival__token">
              {p && <Token avatar={p.avatar} away={!p.online} size={26} />}
              {reactions && <PlayerReaction reactions={reactions} playerId={id} />}
            </span>
            <span className="sol-rival__name">{p?.name ?? 'Someone'}</span>
            <span className="sol-rival__left">
              <b>{s.left}</b> {s.stuck ? 'stuck' : 'to go'}
            </span>
            <span
              className="sol-rival__bar"
              style={{ '--p': `${Math.round((s.played / 52) * 100)}%` } as React.CSSProperties}
              aria-hidden="true"
            />
          </li>
        );
      })}
    </ul>
  );
}

/** What this player pulled when everyone was stuck, for the banner. */
export function pullLine(t: SolitaireTableView, me: string | null, name: (id: string) => string) {
  if (!t.pull) return null;
  const mine = me ? t.pull.cards[me] : undefined;
  if (mine) return { title: 'Everyone was stuck', detail: 'You pulled', card: mine };
  if (me && mine === null)
    return { title: 'Everyone was stuck', detail: 'You had nothing left to pull', card: null };
  const any = Object.entries(t.pull.cards).filter(([, c]) => c);
  return {
    title: 'Everyone pulls a card',
    detail: any.map(([id, c]) => `${name(id)} ${cardShort(c!)}`).join(' · '),
    card: null,
  };
}

/** The banner when everyone pulls: who pulled what, gone after a few seconds or a tap. */
export function PullBanner({
  t,
  me,
  name,
  big,
}: {
  t: SolitaireTableView;
  me: string | null;
  name: (id: string) => string;
  big?: boolean;
}) {
  const [fresh, dismiss] = useMoment(t.pulls);
  useEffect(() => {
    if (fresh === null) return;
    const timer = setTimeout(dismiss, 3000);
    return () => clearTimeout(timer);
  }, [fresh, dismiss]);
  const line = fresh !== null ? pullLine(t, me, name) : null;
  if (!line) return null;
  return (
    <button
      type="button"
      className={['sol-banner', big && 'sol-banner--tv'].filter(Boolean).join(' ')}
      onClick={dismiss}
    >
      <span>
        <b className="jd-display">{line.title}</b>
        <span>{line.detail}</span>
      </span>
      {line.card && <PlayingCard card={line.card} />}
    </button>
  );
}

/**
 * Solitaire on a phone: everyone else along the top, the shared middle, your stock and waste,
 * and your seven columns filling the rest. Tap a card to play it: up to the middle if it goes,
 * otherwise onto a column. Hint points at a move.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({ view, sendAction, reactions, ...props }) => {
  const v = view as SolitairePlayerView;
  const players = props.players as ScreenPlayer[];
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  const seat = v.seats[v.me]!;
  const back = tintOf(players, v.me);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<Move | 'stock' | null>(null);
  const [bump, setBump] = useState<Card | null>(null);

  // A hint lasts a moment, or until the next move.
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 2600);
    return () => clearTimeout(timer);
  }, [hint]);
  useEffect(() => {
    if (!bump) return;
    const timer = setTimeout(() => setBump(null), 420);
    return () => clearTimeout(timer);
  }, [bump]);

  const send = async (a: SolitaireAction) => {
    if (busy || v.over) return;
    setBusy(true);
    setHint(null);
    try {
      await sendAction(a);
    } finally {
      setBusy(false);
    }
  };
  const tap = (from: Source, card: Card) => {
    const m = moveFor(seat, v.foundations, from, card);
    if (m) void send(m);
    else setBump(card);
  };

  const marked = hint === 'stock' ? 'stock' : (hint?.card ?? null);
  const others = v.players.filter((id) => id !== v.me);

  return (
    <div className="sol sol--phone">
      <header className="sol__head">
        <h2 className="jd-display">{statusLine(v, v.me, name)}</h2>
        <Plaque small onClick={() => setHint(hintFor(seat, v))} disabled={v.over || seat.stuck}>
          Hint
        </Plaque>
      </header>

      {others.length > 0 && <Rivals t={v} players={players} ids={others} reactions={reactions} />}

      <Middle
        foundations={v.foundations}
        players={players}
        landed={v.last}
        hint={hint !== null && hint !== 'stock' && hint.type === 'up'}
      />

      <StockWaste
        seat={seat}
        back={back}
        onDraw={() => void send({ type: 'draw' })}
        onWaste={(card) => tap('waste', card)}
        marked={marked}
        bump={bump}
      />

      <div className="sol-stage">
        <Tableau seat={seat} back={back} onCard={tap} marked={marked} bump={bump} />
      </div>

      <PullBanner t={v} me={v.me} name={name} />
    </div>
  );
};
