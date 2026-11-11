'use client';

import { useRef, useState } from 'react';
import {
  Plaque,
  Token,
  useCountdown,
  useMoment,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { cardName, housePower } from '../cards';
import { PEEK_MS, lastRoundPlayed, type CambioAction, type CambioPlayerView } from '../rules';
import { useAfter, useGlimpses, useSwapFlight } from './hooks';
import {
  SLOT_NAME,
  discardLabel,
  eyesOf,
  rankRound,
  roundLine,
  roundMoment,
  dropLine,
  ruleLine,
  statusLine,
} from './logic';
import { GameCard, HouseContext } from './pieces';
import {
  CambioBand,
  CambioTable,
  HouseRules,
  HandsList,
  HIDDEN,
  PlayByPlay,
  Scores,
  TurnClock,
  type Ctl,
  type SlotFn,
} from './table';
import './cambio.css';

/** What to draw for every slot you can see: faces only as glimpses, notes, or the opening peek. */
function slotsFor(v: CambioPlayerView, glimpse: ReturnType<typeof useGlimpses>): SlotFn {
  return (owner, slot) => {
    if (v.hands) {
      const c = v.hands[owner]?.[slot];
      return { id: c ?? null, up: c !== undefined, note: null };
    }
    const known = v.grid[owner]?.[slot] ?? null;
    if (
      v.phase === 'peek' &&
      owner === v.me &&
      v.house.peekSlots.includes(slot) &&
      !v.ready.includes(v.me)
    ) {
      return { id: known, up: known !== null, note: null };
    }
    if (v.notes) return { id: null, up: false, note: known };
    const g = glimpse(owner, slot);
    return g ? { id: g.card, up: g.up, note: null } : HIDDEN;
  };
}

type Sel = { mine: number | null; player: string | null; slot: number | null };
const NONE: Sel = { mine: null, player: null, slot: null };

/** Whether this player may be looked at or swapped with. */
const open = (v: CambioPlayerView, id: string) => id !== v.me && id !== v.caller;

/**
 * Cambio on a phone: the felt with the other players, then your own four cards large at the
 * bottom with what you can do beside them. Everything that happens to a card (a power, a swap)
 * is a tap on the card itself.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  reactions,
  now,
  ...props
}) => {
  const v = view as CambioPlayerView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const meP = byId.get(v.me);
  const root = useRef<HTMLDivElement>(null);
  useSwapFlight(root, v.moves);
  const glimpse = useGlimpses(v);
  const slots = slotsFor(v, glimpse);
  const [fresh, dismiss] = useMoment(v.last?.round ?? 0);
  const settled = useAfter(fresh !== null, 1500);
  const moment = fresh !== null && settled ? roundMoment(v, v.me, name) : null;
  const [sel, setSel] = useState<Sel>(NONE);
  const [zoom, setZoom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = v.phase === 'play' && v.toAct === v.me;
  const kind = v.power?.kind;
  const two = v.step === 'power' && (kind === 'swap' || kind === 'king');
  // The turn moved on under you (the timer, say): put any half-made choice away.
  if (!mine && (sel !== NONE || zoom)) {
    setSel(NONE);
    setZoom(null);
  }

  const send = async (a: CambioAction) => {
    setBusy(true);
    try {
      return await sendAction(a);
    } finally {
      setBusy(false);
    }
  };

  const legal = (owner: string, _slot: number) => {
    if (!mine || busy) return false;
    if (v.step === 'held') return owner === v.me;
    if (v.step !== 'power') return false;
    if (kind === 'peek') return owner === v.me;
    if (kind === 'spy') return open(v, owner);
    if (kind === 'swap' || kind === 'king') return owner === v.me || open(v, owner);
    return false;
  };
  const pick = (owner: string, slot: number) => {
    if (!legal(owner, slot)) return;
    if (v.step === 'held') return void send({ type: 'keep', slot });
    if (kind === 'peek') return void send({ type: 'peekOwn', slot });
    if (kind === 'spy') return void send({ type: 'spy', player: owner, slot });
    if (!two) return;
    const next: Sel = owner === v.me ? { ...sel, mine: slot } : { ...sel, player: owner, slot };
    if (next.mine !== null && next.player !== null && next.slot !== null) {
      setSel(NONE);
      void send(
        kind === 'swap'
          ? { type: 'swap', mySlot: next.mine, player: next.player, slot: next.slot }
          : { type: 'kingLook', mySlot: next.mine, player: next.player, slot: next.slot },
      );
    } else setSel(next);
  };
  const picked = (owner: string, slot: number) =>
    owner === v.me ? sel.mine === slot : sel.player === owner && sel.slot === slot;

  const canDraw = mine && v.step === 'start' && !busy && (v.stockCount > 0 || v.discardCount > 1);
  const canTake = mine && v.step === 'start' && !busy && v.top !== null;
  const look =
    mine && v.step === 'king' && v.look
      ? {
          mine: v.grid[v.me]?.[v.look.mySlot] ?? null,
          theirs: v.grid[v.look.player]?.[v.look.slot] ?? null,
          who: name(v.look.player),
        }
      : null;
  const ctl: Ctl = {
    legal,
    picked,
    pick,
    zoom,
    setZoom,
    onDraw: canDraw ? () => void send({ type: 'draw' }) : undefined,
    onTake: canTake ? () => void send({ type: 'take' }) : undefined,
    held: v.held,
    discard:
      mine && v.step === 'held' && v.holding?.from === 'stock' && v.held !== null && !busy
        ? {
            label: discardLabel(housePower(v.held, v.house)),
            onClick: () => void send({ type: 'discard' }),
          }
        : null,
    look,
  };
  const scoring = v.phase === 'scoring' || v.phase === 'over';

  return (
    <HouseContext.Provider value={v.house}>
      <div
        className={`cmb cmb--phone${mine ? ' is-mine' : ''}${scoring ? ' is-scoring' : ''}`}
        ref={root}
        data-count={v.players.length}
      >
        <header className="cmb__head">
          <h2 className="jd-display">{statusLine(v, v.me, name)}</h2>
          <div className="cmb__sub">
            <span>{scoring ? 'Lowest wins' : roundLine(v)}</span>
            <TurnClock t={v} now={now} />
            {!scoring && <HouseRules house={v.house} mode="plaque" />}
          </div>
        </header>
        <PlayByPlay moves={v.moves} name={name} me={v.me} limit={6} />

        {scoring ? (
          <>
            <div className="cmb-main cmb-main--hands">
              <HandsList
                key={v.round}
                order={rankRound(v.last!)}
                hands={v.hands ?? v.last!.hands}
                players={players}
                me={v.me}
                caller={v.last!.caller}
                flip
                size="phone"
              />
            </div>
            <ScoringPanel v={v} players={players} name={name} now={now} send={send} />
          </>
        ) : (
          <>
            <div className="cmb-main">
              <CambioTable
                t={v}
                players={players}
                me={v.me}
                slots={slots}
                ctl={ctl}
                reactions={reactions}
              />
            </div>
            <section className="cmb-side" aria-label="Your cards">
              <MyGrid v={v} slots={slots} ctl={ctl} meP={meP} />
              <Dock v={v} name={name} now={now} busy={busy} send={send} sel={sel} />
            </section>
            <Scores t={v} players={players} me={v.me} />
          </>
        )}

        <HouseRules house={v.house} mode="list" />
        <CambioBand t={v} name={name} />
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
    </HouseContext.Provider>
  );
};

/** Your four cards, large, with a gold ring on them when it's your turn. */
function MyGrid({
  v,
  slots,
  ctl,
  meP,
}: {
  v: CambioPlayerView;
  slots: SlotFn;
  ctl: Ctl;
  meP?: ScreenPlayer;
}) {
  const mine = v.phase === 'play' && v.toAct === v.me;
  const eyes = eyesOf(v);
  const hint = v.step === 'held' ? 'swap it in' : v.step === 'power' ? 'choose it' : '';
  return (
    <div className={`cmb-me${mine ? ' is-turn' : ''}`}>
      <p className="cmb-me__plate">
        {meP && <Token avatar={meP.avatar} away={!meP.online} />}
        <span>You</span>
        <b>{v.scores[v.me] ?? 0}</b>
      </p>
      <div className="cmb-me__grid" role="group" aria-label="Your cards">
        {[0, 1, 2, 3].map((slot) => {
          const s = slots(v.me, slot);
          const ok = ctl.legal(v.me, slot);
          const eye = eyes.get(`${v.me}:${slot}`);
          const face = s.id !== null && s.up ? cardName(s.id) : 'face down';
          const note = s.note !== null ? `, noted ${cardName(s.note)}` : '';
          const label = `Your card, ${SLOT_NAME[slot]}: ${face}${note}${ok && hint ? `, ${hint}` : ''}${eye ? ', someone looked at it' : ''}`;
          return (
            <GameCard
              key={slot}
              id={s.id}
              up={s.up}
              note={s.note}
              can={ok}
              picked={ctl.picked(v.me, slot)}
              lock={v.caller === v.me}
              eye={eye ? `${eye} looked at this card` : undefined}
              slotKey={`${v.me}:${slot}`}
              className="cmb-me__card"
              onClick={ok ? () => ctl.pick(v.me, slot) : undefined}
              label={label}
            />
          );
        })}
        {v.caller === v.me && <span className="cmb-ribbon">Cambio</span>}
      </div>
      {v.turns < v.players.length && v.phase !== 'peek' && v.house.peekSlots.length > 0 && (
        <p className="cmb-me__hint">
          {v.house.peekSlots.length === 1
            ? 'Bottom left: your opening peek'
            : 'Bottom two: your opening peek'}
        </p>
      )}
    </div>
  );
}

/** The ring that counts the peek down. */
function Ring({ left, total }: { left: number; total: number }) {
  const frac = Math.max(0, Math.min(1, left / total));
  return (
    <span className="cmb-ring-clock" role="timer" aria-label={`${left} seconds left to look`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="19" className="cmb-ring-clock__track" />
        <circle
          cx="22"
          cy="22"
          r="19"
          className="cmb-ring-clock__arc"
          pathLength={1}
          strokeDasharray={`${frac} 1`}
        />
      </svg>
      <b>{left}</b>
    </span>
  );
}

/** What you can do, in thumb reach beside your cards. */
function Dock({
  v,
  name,
  now,
  busy,
  send,
  sel,
}: {
  v: CambioPlayerView;
  name: (id: string) => string;
  now: () => number;
  busy: boolean;
  send: (a: CambioAction) => Promise<boolean>;
  sel: Sel;
}) {
  const left = useCountdown(v.peekAt, now);
  const mine = v.phase === 'play' && v.toAct === v.me;
  const lastTurn = !!v.caller && v.turnsLeft.includes(v.me);

  if (v.phase === 'peek') {
    const ready = v.ready.includes(v.me);
    const waiting = v.players.filter((id) => !v.ready.includes(id) && id !== v.me).map(name);
    return (
      <section className="cmb-dock" aria-label="The opening peek">
        {ready ? (
          <p className="cmb-dock__say" role="status">
            {waiting.length ? `Waiting for ${waiting.join(', ')}.` : 'Here we go.'}
          </p>
        ) : (
          <>
            <p className="cmb-dock__say">
              {v.house.peekSlots.length === 1
                ? 'Your bottom left card is face up until you’re ready.'
                : 'Your two bottom cards are face up until you’re ready.'}
            </p>
            <div className="cmb-dock__row">
              {left !== null && <Ring left={left} total={PEEK_MS / 1000} />}
              <Plaque go disabled={busy} onClick={() => void send({ type: 'ready' })}>
                Ready
              </Plaque>
            </div>
          </>
        )}
      </section>
    );
  }

  if (!mine) {
    return (
      <section className="cmb-dock" aria-label="Waiting">
        <p className="cmb-dock__say" role="status">
          {v.toAct ? `Waiting for ${name(v.toAct)}.` : ''}
        </p>
        {lastTurn && <p className="cmb-dock__last">Cambio was called. This is your last turn.</p>}
      </section>
    );
  }

  const canCall = v.step === 'start' && !v.caller && v.turns > 0 && !busy;
  const kind = v.power?.kind;
  let say: string;
  if (v.step === 'start') say = 'Tap the stock to draw, or the discard to take it.';
  else if (v.step === 'held')
    say =
      v.holding?.from === 'discard' && v.held !== null
        ? `You took the ${cardName(v.held)}. Tap a card of yours to swap it in.`
        : v.held !== null
          ? `You drew the ${cardName(v.held)}. Tap a card of yours to swap it in, or discard it.`
          : '';
  else if (v.step === 'king') say = 'Swap the two cards, or leave them?';
  else if (kind === 'peek') say = 'Tap one of your cards to look at it.';
  else if (kind === 'spy') say = 'Tap a player, then one of their cards, to look at it.';
  else if (kind === 'swap')
    say =
      sel.mine !== null
        ? 'Now tap a card of theirs.'
        : sel.player !== null
          ? 'Now tap a card of yours.'
          : 'Tap one of yours and one of theirs. They swap, unseen.';
  else
    say =
      sel.mine !== null
        ? 'Now tap a card of theirs.'
        : sel.player !== null
          ? 'Now tap a card of yours.'
          : 'Tap one of yours and one of theirs to look at both.';

  return (
    <section className="cmb-dock" aria-label="Your move">
      <p className="cmb-dock__say" role="status">
        {say}
      </p>
      {lastTurn && <p className="cmb-dock__last">Last turn: Cambio was called.</p>}
      {v.step === 'start' && (
        <>
          <Plaque disabled={!canCall} onClick={() => void send({ type: 'call' })}>
            Call Cambio
          </Plaque>
          {!canCall && (
            <p className="cmb-dock__why">
              {v.caller
                ? 'Cambio is already called.'
                : v.turns === 0
                  ? 'Not on the first turn.'
                  : ''}
            </p>
          )}
        </>
      )}
      {v.step === 'power' && (
        <Plaque disabled={busy} onClick={() => void send({ type: 'skipPower' })}>
          Skip
        </Plaque>
      )}
      {v.step === 'king' && (
        <div className="cmb-dock__row cmb-dock__row--two">
          <Plaque go disabled={busy} onClick={() => void send({ type: 'kingSwap' })}>
            Swap them
          </Plaque>
          <Plaque disabled={busy} onClick={() => void send({ type: 'kingKeep' })}>
            Leave them
          </Plaque>
        </div>
      )}
    </section>
  );
}

/** After a round: the rule for the caller, the ranked scores, the countdown and Next round. */
export function ScoringPanel({
  v,
  players,
  name,
  now,
  send,
}: {
  v: CambioPlayerView;
  players: ScreenPlayer[];
  name: (id: string) => string;
  now: () => number;
  send: (a: CambioAction) => Promise<boolean>;
}) {
  const left = useCountdown(v.nextAt, now);
  const final = lastRoundPlayed(v);
  const ready = v.nextReady.includes(v.me);
  return (
    <section className="cmb-side cmb-side--score" aria-label="Round result">
      {v.last && <p className="cmb-rule">{ruleLine(v.last, name, v.me, v.house)}</p>}
      {v.last && dropLine(v.last, name, v.me) && (
        <p className="cmb-rule">{dropLine(v.last, name, v.me)}</p>
      )}
      <Scores t={v} players={players} me={v.me} />
      {left !== null && v.phase === 'scoring' && (
        <p className="cmb-dock__count" role="status">
          {left > 0 ? `${final ? 'The result' : 'Next round'} in ${left}…` : 'Dealing…'}
        </p>
      )}
      <Plaque go disabled={ready} onClick={() => void send({ type: 'next', after: v.round })}>
        {ready ? 'Waiting for the others' : final ? 'See the result' : 'Next round'}
      </Plaque>
    </section>
  );
}
