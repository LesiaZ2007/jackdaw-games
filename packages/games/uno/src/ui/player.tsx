'use client';

import { useState, type CSSProperties } from 'react';
import {
  Plaque,
  useCountdown,
  useMoment,
  VerdictMoment,
  type GameUi,
  type Outcome,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { COLOURS, COLOUR_NAME, cardName, isWild, points, type Colour } from '../cards';
import {
  lastRoundPlayed,
  playable,
  type UnoAction,
  type UnoPlayerView,
  type UnoTableView,
} from '../rules';
import { GameCard, Swatch } from './pieces';
import { UnoTable } from './table';
import './uno.css';

/** "Round 2 · first to 200". */
export function roundLine(t: UnoTableView): string {
  return t.target > 0 ? `Round ${t.round} · first to ${t.target}` : 'One round';
}

/** This player's result for the round just finished, for the moment over the screen. */
export function roundMoment(t: UnoTableView, me: string | null, name: (id: string) => string) {
  const last = t.last;
  if (!last) return null;
  if (!me || !t.players.includes(me)) {
    return {
      outcome: 'reveal' as Outcome,
      title: `${name(last.winner)} went out`,
      detail: `${last.points} points`,
    };
  }
  if (last.winner === me) {
    return { outcome: 'win' as Outcome, title: 'You went out!', detail: `+${last.points} points` };
  }
  const left = last.left[me] ?? [];
  const worth = left.reduce((a, c) => a + points(c), 0);
  return {
    outcome: 'loss' as Outcome,
    title: `${name(last.winner)} went out`,
    detail: `You were left with ${left.length} ${left.length === 1 ? 'card' : 'cards'}, worth ${worth}.`,
  };
}

/** Who the game is waiting on, and for what, in one line. */
export function statusLine(t: UnoTableView, me: string | null, name: (id: string) => string) {
  if (t.phase !== 'play' || !t.toAct) return '';
  const who = t.toAct === me ? 'You' : name(t.toAct);
  if (t.pending) {
    const from = t.pending.from === me ? 'you' : name(t.pending.from);
    return `${who} ${t.toAct === me ? 'have' : 'has'} to take ${t.pending.count} from ${from}`;
  }
  if (t.deciding) return `${who} drew a card that goes`;
  return t.toAct === me ? 'Your turn' : `${name(t.toAct)}’s turn`;
}

/**
 * UNO on a phone: the table from your seat with both piles, your hand fanned along the bottom
 * (the cards that go lifted on your turn, tap one to play it), and the dock under it: draw or
 * take, keep a drawn card, challenge a Wild Draw Four, call UNO, or catch someone who didn't.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  reactions,
  now,
  ...props
}) => {
  const v = view as UnoPlayerView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [fresh, dismiss] = useMoment(v.last?.round ?? 0);
  const moment = fresh !== null ? roundMoment(v, v.me, name) : null;
  const [pick, setPick] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = v.phase === 'play' && v.toAct === v.me;
  const can = new Set(playable(v));
  const meP = byId.get(v.me);

  const send = async (a: UnoAction) => {
    setBusy(true);
    try {
      return await sendAction(a);
    } finally {
      setBusy(false);
    }
  };
  const playCard = (card: number, colour?: Colour) => {
    setPick(null);
    const call = armed && v.hand.length === 2;
    setArmed(false);
    void send({ type: 'play', card, colour, call });
  };
  const tap = (card: number) => {
    if (busy || !can.has(card)) return;
    if (isWild(card)) setPick(card);
    else playCard(card);
  };
  const canDraw = mine && v.drawn === null && !busy;

  return (
    <div className="uno uno--phone">
      <header className="uno__head">
        <h2 className="jd-display">
          {v.phase === 'play'
            ? statusLine(v, v.me, name)
            : v.phase === 'done'
              ? 'Round over'
              : 'Game over'}
        </h2>
        <p>{roundLine(v)}</p>
      </header>

      <div className="uno-stage">
        <UnoTable
          t={v}
          players={players}
          me={v.me}
          reactions={reactions}
          onDraw={canDraw ? () => void send({ type: 'draw' }) : undefined}
        />
      </div>

      <Hand v={v} can={can} mine={mine && pick === null} onTap={tap} picking={pick} />

      {v.phase !== 'play' ? (
        <NextRound key={v.round} t={v} send={send} now={now} />
      ) : pick !== null ? (
        <ColourPicker card={pick} onPick={(c) => playCard(pick, c)} onBack={() => setPick(null)} />
      ) : (
        <Dock
          v={v}
          name={name}
          now={now}
          busy={busy}
          canPlay={can.size > 0}
          armed={armed}
          setArmed={setArmed}
          send={send}
        />
      )}

      {moment && (
        <VerdictMoment
          key={v.last?.round}
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

/**
 * Your cards, fanned so the whole hand always fits the width: they overlap more as it grows. On
 * your turn the ones that go are lifted and the rest are dimmed.
 */
function Hand({
  v,
  can,
  mine,
  onTap,
  picking,
}: {
  v: UnoPlayerView;
  can: Set<number>;
  mine: boolean;
  onTap: (card: number) => void;
  picking: number | null;
}) {
  if (v.hand.length === 0) {
    return <p className="uno-hand uno-hand--empty">{v.phase === 'play' ? 'No cards.' : ''}</p>;
  }
  return (
    <section
      className="uno-hand"
      aria-label={`Your ${v.hand.length} cards`}
      style={{ '--n': v.hand.length } as CSSProperties}
    >
      {v.hand.map((id, i) => (
        <GameCard
          key={id}
          id={id}
          className={[
            'uno-hand__card',
            v.drawn === id && 'uno-hand__card--drawn',
            picking === id && 'uno-hand__card--picked',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ '--i': i } as CSSProperties}
          can={mine && can.has(id)}
          dim={mine && !can.has(id)}
          onClick={() => onTap(id)}
          label={`${cardName(id)}${mine && can.has(id) ? ', play it' : ''}`}
        />
      ))}
    </section>
  );
}

/** "12s" while a turn timer runs. */
export function TurnClock({ t, now }: { t: UnoTableView; now: () => number }) {
  const left = useCountdown(t.actBy, now);
  if (left === null) return null;
  return (
    <span
      className={left <= 5 ? 'uno-clock is-low' : 'uno-clock'}
      aria-label={`${left} seconds left`}
    >
      {left}s
    </span>
  );
}

/** A wild is going down: call its colour. */
function ColourPicker({
  card,
  onPick,
  onBack,
}: {
  card: number;
  onPick: (c: Colour) => void;
  onBack: () => void;
}) {
  return (
    <section className="uno-dock" aria-label="Choose a colour">
      <p className="uno-dock__say">{cardName(card)}: choose the colour.</p>
      <div className="uno-colours">
        {COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            className={`uno-colour uno-colour--${c}`}
            onClick={() => onPick(c)}
          >
            <Swatch colour={c} />
            {COLOUR_NAME[c]}
          </button>
        ))}
      </div>
      <Plaque small onClick={onBack}>
        Back
      </Plaque>
    </section>
  );
}

/** Everything you can do during a round, in thumb reach. */
function Dock({
  v,
  name,
  now,
  busy,
  canPlay,
  armed,
  setArmed,
  send,
}: {
  v: UnoPlayerView;
  name: (id: string) => string;
  now: () => number;
  busy: boolean;
  canPlay: boolean;
  armed: boolean;
  setArmed: (a: boolean) => void;
  send: (a: UnoAction) => Promise<boolean>;
}) {
  const mine = v.toAct === v.me;
  const catchable = v.uncalled && v.uncalled !== v.me ? v.uncalled : null;
  const mustCall = v.uncalled === v.me;
  // Down to two with a card that goes: say UNO as you play it.
  const offerCall = mine && !v.pending && v.hand.length === 2 && canPlay;
  const p = v.pending;

  let say: string;
  if (!mine) say = v.toAct ? `Waiting for ${name(v.toAct)}.` : '';
  else if (p) {
    say =
      p.wild4 && p.was
        ? `${name(p.from)} played a Wild Draw Four. Take ${p.count}, or challenge if you think they held ${COLOUR_NAME[p.was].toLowerCase()}${v.stacking ? ', or stack one' : ''}.`
        : `Take ${p.count}${v.stacking ? ', or pass it on with a draw card' : ''}.`;
  } else if (v.drawn !== null) say = `You drew ${cardName(v.drawn)}. Play it, or keep it.`;
  else say = canPlay ? 'Play a card, or draw.' : 'Nothing goes. Draw a card.';

  return (
    <section className="uno-dock" aria-label="Your move">
      {(catchable || mustCall) && (
        <div className="uno-dock__row uno-dock__row--one">
          {mustCall ? (
            <Plaque
              go
              className="uno-uno"
              disabled={busy}
              onClick={() => void send({ type: 'call' })}
            >
              UNO!
            </Plaque>
          ) : (
            <Plaque
              className="uno-catch"
              disabled={busy}
              onClick={() => void send({ type: 'catch' })}
            >
              Catch {name(catchable!)}! They didn’t say UNO
            </Plaque>
          )}
        </div>
      )}
      <p className="uno-dock__say" role="status">
        <span>{say}</span>
        <TurnClock t={v} now={now} />
      </p>
      {mine && (
        <div className="uno-dock__row">
          {p ? (
            <>
              <Plaque disabled={busy} onClick={() => void send({ type: 'draw' })}>
                Take {p.count}
              </Plaque>
              {p.wild4 && (
                <Plaque go disabled={busy} onClick={() => void send({ type: 'challenge' })}>
                  Challenge
                </Plaque>
              )}
            </>
          ) : v.drawn !== null ? (
            <Plaque disabled={busy} onClick={() => void send({ type: 'pass' })}>
              Keep it
            </Plaque>
          ) : (
            <>
              <Plaque go={!canPlay} disabled={busy} onClick={() => void send({ type: 'draw' })}>
                Draw
              </Plaque>
              {offerCall && (
                <button
                  type="button"
                  className="uno-arm"
                  aria-pressed={armed}
                  onClick={() => setArmed(!armed)}
                >
                  {armed ? 'UNO! said' : 'Say UNO!'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Between rounds: a countdown, then the next deal (or the results after the last round). */
function NextRound({
  t,
  send,
  now,
}: {
  t: UnoTableView;
  send: (a: UnoAction) => Promise<boolean>;
  now: () => number;
}) {
  const final = lastRoundPlayed(t);
  const left = useCountdown(t.dealAt, now);
  return (
    <section className="uno-dock" aria-label="Next round">
      {left !== null && (
        <p className="uno-dock__count" role="status">
          {left > 0
            ? `${final ? 'The winner' : 'Next round'} in ${left}…`
            : final
              ? 'Adding up…'
              : 'Dealing…'}
        </p>
      )}
      <Plaque onClick={() => void send({ type: 'deal', after: t.round })}>
        {final ? 'See who won now' : 'Deal now'}
      </Plaque>
    </section>
  );
}
