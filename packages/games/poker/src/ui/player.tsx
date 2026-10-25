'use client';

import { useState } from 'react';
import {
  Plaque,
  useCountdown,
  useMoment,
  VerdictMoment,
  type GameUi,
  type Outcome,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { bestHand, startingHandName } from '../cards';
import {
  choices,
  lastHandPlayed,
  type PokerAction,
  type PokerPlayerView,
  type PokerTableView,
} from '../rules';
import { PlayingCard, chips } from './pieces';
import { PokerTable } from './table';
import './poker.css';

export const STREET_NAME: Record<string, string> = {
  preflop: 'Before the flop',
  flop: 'The flop',
  turn: 'The turn',
  river: 'The river',
  done: 'Hand over',
  over: 'Game over',
};

/** "Hand 7 of 30 · Blinds 10/20 · doubling after hand 10". */
export function handLine(t: PokerTableView): string {
  const parts = [
    t.handLimit > 0 ? `Hand ${t.hand} of ${t.handLimit}` : `Hand ${t.hand}`,
    `Blinds ${chips(t.sb)}/${chips(t.bb)}`,
  ];
  if (t.doubleEvery > 0) {
    const next = Math.ceil(t.hand / t.doubleEvery) * t.doubleEvery;
    parts.push(`double after hand ${next}`);
  }
  return parts.join(' · ');
}

/** This player's result for the hand just finished, for the moment over the screen. */
export function handMoment(t: PokerTableView, me: string | null, name: (id: string) => string) {
  const last = t.last;
  if (!last) return null;
  // The main pot: everyone still in at the end played for it.
  const main = last.pots[0];
  const winners = [...new Set(last.pots.flatMap((p) => p.winners))];
  // Each pot's winners once, biggest first: "Rook wins 3,000 · Wren wins 200".
  const shares = new Map<string, { who: string[]; amount: number }>();
  for (const p of last.pots) {
    const key = p.winners.join();
    const got = shares.get(key);
    if (got) got.amount += p.amount;
    else shares.set(key, { who: p.winners, amount: p.amount });
  }
  const headline = main
    ? [...shares.values()]
        .sort((a, b) => b.amount - a.amount)
        .map(
          (x) =>
            `${x.who.map(name).join(' and ')} ${x.who.length > 1 ? 'split' : 'wins'} ${chips(x.amount)}`,
        )
        .join(' · ')
    : 'The hand is over';
  if (!me || !t.inHand.includes(me)) {
    return { outcome: 'reveal' as Outcome, title: headline, detail: main?.hand };
  }
  const net = last.net[me] ?? 0;
  if (winners.includes(me) && net >= 0) {
    return {
      outcome: 'win' as Outcome,
      title: `You won ${chips(last.won[me] ?? 0)}`,
      detail: last.showdown ? last.hands[me] : 'Everyone else folded.',
    };
  }
  // Folding is its own answer; only a hand that went to the end gets a moment.
  if (!last.showdown || !last.shown[me]) return null;
  return {
    outcome: 'loss' as Outcome,
    title: `You lost ${chips(-net)}`,
    detail: main
      ? `${main.winners.map(name).join(' and ')}: ${main.hand.toLowerCase()}`
      : undefined,
  };
}

/** Round to a whole number of small chips, within the allowed range. */
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(x)));

/**
 * Poker on a phone: the table from your seat, your two cards, and the betting controls at the
 * bottom, within thumb reach, when it's your turn.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  reactions,
  now,
  ...props
}) => {
  const v = view as PokerPlayerView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [fresh, dismiss] = useMoment(v.last?.hand ?? 0);
  const moment = fresh !== null ? handMoment(v, v.me, name) : null;
  const done = v.phase === 'done';
  const meP = byId.get(v.me);
  const send = (a: PokerAction) => sendAction(a);
  // What you're holding, in words: your two cards before the flop, then your best five.
  const hand =
    v.hole.length !== 2
      ? null
      : v.board.length >= 3
        ? bestHand([...v.hole, ...v.board]).name
        : startingHandName(v.hole);
  const folded = v.folded.includes(v.me);
  // Still in the hand with chips to bet: the betting dock stays up, greyed out until your turn.
  const inHand = !done && !folded && v.hole.length === 2 && choices(v, v.me).stack > 0;

  return (
    <div className="pk pk--phone">
      <header className="pk__head">
        <h2 className="jd-display">{STREET_NAME[v.phase]}</h2>
        <p>{handLine(v)}</p>
      </header>

      <div className="pk-stage">
        <PokerTable t={v} players={players} me={v.me} reactions={reactions} />
      </div>

      <section className="pk-me" aria-label="Your cards">
        {v.hole.length === 2 ? (
          <div className={folded ? 'pk-me__cards pk-me__cards--folded' : 'pk-me__cards'}>
            {v.hole.map((c) => (
              <PlayingCard key={`${v.hand}-${c}`} card={c} className="pk-deal" />
            ))}
          </div>
        ) : null}
        <p className="pk-me__what">
          {v.hole.length < 2
            ? 'You’re out of chips. Watch the rest of the game.'
            : folded
              ? 'You folded this hand.'
              : (hand ?? 'Your two cards. Nobody else sees them.')}
        </p>
      </section>

      {done ? (
        <NextHand key={v.hand} t={v} me={v.me} send={send} now={now} />
      ) : v.toAct === v.me || inHand ? (
        <Betting
          key={`${v.hand}-${v.log.length}`}
          t={v}
          me={v.me}
          send={send}
          now={now}
          waitingOn={v.toAct === v.me ? null : v.toAct ? name(v.toAct) : 'the deal'}
        />
      ) : (
        <Waiting t={v} name={name} now={now} />
      )}

      {moment && (
        <VerdictMoment
          key={v.last?.hand}
          outcome={moment.outcome}
          title={moment.title}
          detail={moment.detail}
          avatar={moment.outcome === 'reveal' ? undefined : meP?.avatar}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** "12s" while a turn timer runs, for the dock. */
function TurnClock({ t, now }: { t: PokerTableView; now: () => number }) {
  const left = useCountdown(t.actBy, now);
  if (left === null) return null;
  return (
    <span
      className={left <= 5 ? 'pk-clock is-low' : 'pk-clock'}
      aria-label={`${left} seconds left`}
    >
      {left}s
    </span>
  );
}

/** Someone else is to act. */
function Waiting({
  t,
  name,
  now,
}: {
  t: PokerTableView;
  name: (id: string) => string;
  now: () => number;
}) {
  return (
    <p className="pk-dock pk-dock__wait" role="status">
      <span>{t.toAct ? `Waiting for ${name(t.toAct)}.` : 'Dealing…'}</span>
      <TurnClock t={t} now={now} />
    </p>
  );
}

/**
 * Between hands: a countdown, then the server deals the next hand by itself (or shows who won
 * after the last). Anyone can deal straight away, and a player out of chips may buy back in if the
 * table allows.
 */
function NextHand({
  t,
  me,
  send,
  now,
}: {
  t: PokerTableView;
  me: string;
  send: (a: PokerAction) => Promise<boolean>;
  now: () => number;
}) {
  const final = lastHandPlayed(t);
  const left = useCountdown(t.dealAt, now);
  const buyBack = t.canBuyBack.includes(me);

  return (
    <section className="pk-dock" aria-label="Next hand">
      {left !== null && (
        <p className="pk-dock__count" role="status">
          {left > 0
            ? `${final ? 'The winner' : 'Next hand'} in ${left}…`
            : final
              ? 'Counting the chips…'
              : 'Dealing…'}
        </p>
      )}
      {buyBack ? (
        <div className="pk-dock__row">
          <Plaque go onClick={() => void send({ type: 'buyBack' })}>
            Buy back in
          </Plaque>
          <Plaque onClick={() => void send({ type: 'deal', after: t.hand })}>Deal now</Plaque>
        </div>
      ) : (
        <Plaque onClick={() => void send({ type: 'deal', after: t.hand })}>
          {final ? 'See who won now' : 'Deal now'}
        </Plaque>
      )}
    </section>
  );
}

/**
 * Fold, check or call, and a raise with its amount. It stays on screen while you're in the hand:
 * anything you can't do right now is greyed out (all of it while someone else is acting).
 */
function Betting({
  t,
  me,
  send,
  now,
  waitingOn,
}: {
  t: PokerTableView;
  me: string;
  send: (a: PokerAction) => Promise<boolean>;
  now: () => number;
  /** Who the table is waiting on, when it isn't you. */
  waitingOn: string | null;
}) {
  const c = choices(t, me);
  const live = waitingOn === null;
  const canRaise = live && c.canRaise;
  const [to, setTo] = useState(c.minTo);
  const [busy, setBusy] = useState(false);
  const potAfterCall = t.pot + c.owe;
  const presets = [
    { label: 'Min', to: c.minTo },
    { label: '½ pot', to: t.currentBet + potAfterCall / 2 },
    { label: 'Pot', to: t.currentBet + potAfterCall },
    { label: 'All in', to: c.max },
  ]
    .map((p) => ({ ...p, to: clamp(p.to, c.minTo, c.max) }))
    // ½ pot and Pot are greyed out when they come to the same as Min or All in.
    .map((p, i, all) => ({
      ...p,
      same:
        i > 0 && i < all.length - 1 && (p.to === all[0]!.to || p.to === all[all.length - 1]!.to),
    }));
  const go = async (a: PokerAction) => {
    setBusy(true);
    try {
      await send(a);
    } finally {
      setBusy(false);
    }
  };
  const allIn = to >= c.max;
  const verb = t.currentBet === 0 ? 'Bet' : 'Raise to';

  return (
    <section
      className={live ? 'pk-dock pk-bet-dock' : 'pk-dock pk-bet-dock is-waiting'}
      aria-label="Your move"
    >
      {(t.actBy || !live) && (
        <p className="pk-dock__wait" role={live ? undefined : 'status'}>
          <span>{live ? 'Your move.' : `Waiting for ${waitingOn}.`}</span>
          <TurnClock t={t} now={now} />
        </p>
      )}
      <div className="pk-dock__row">
        <Plaque disabled={busy || !live} onClick={() => void go({ type: 'fold' })}>
          Fold
        </Plaque>
        {c.canCheck ? (
          <Plaque disabled={busy || !live} onClick={() => void go({ type: 'check' })}>
            Check
          </Plaque>
        ) : (
          <Plaque disabled={busy || !live} onClick={() => void go({ type: 'call' })}>
            {c.owe >= c.stack ? `Call all in ${chips(c.owe)}` : `Call ${chips(c.owe)}`}
          </Plaque>
        )}
      </div>
      <div className="pk-dock__presets" role="group" aria-label="Raise size">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={canRaise && to === p.to}
            disabled={!canRaise || p.same}
            onClick={() => setTo(p.to)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="pk-dock__row pk-dock__raise">
        <span className="pk-stepper">
          <button
            type="button"
            aria-label="Less"
            disabled={!canRaise || to <= c.minTo}
            onClick={() => setTo(clamp(to - t.bb, c.minTo, c.max))}
          >
            −
          </button>
          <output aria-live="polite">{canRaise ? chips(to) : '–'}</output>
          <button
            type="button"
            aria-label="More"
            disabled={!canRaise || to >= c.max}
            onClick={() => setTo(clamp(to + t.bb, c.minTo, c.max))}
          >
            +
          </button>
        </span>
        <Plaque
          go={canRaise}
          disabled={busy || !canRaise}
          onClick={() => void go(allIn ? { type: 'allIn' } : { type: 'raise', to })}
        >
          {!live || canRaise
            ? allIn
              ? `All in ${chips(c.max)}`
              : `${verb} ${chips(to)}`
            : 'No raise now'}
        </Plaque>
      </div>
    </section>
  );
}
