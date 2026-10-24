'use client';

import { VerdictMoment, useMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { useState } from 'react';
import { citySpots, piecesLeft, roadSpots, settlementSpots } from '../build';
import { layout } from '../geometry';
import { awardMoment, robberyMoment, type Moment } from '../moments';
import {
  robberSpots,
  victimsAt,
  type CatanAction,
  type CatanTableView,
  type CatanView,
  type Offer,
} from '../rules';
import { emptyCards, type Cards } from '../types';
import { CatanBoard } from './board';
import { namer } from './common';
import { Hand } from './hand';
import { RESOURCE_NAME, seatColour } from './palette';
import {
  BuildSheet,
  CardsSheet,
  DiscardSheet,
  OfferCard,
  TradeSheet,
  buildOptions,
} from './sheets';
import { Opponents, TurnStrip } from './strip';
import './catan.css';
import './phone.css';

type Kind = 'road' | 'settlement' | 'city';

interface Picks {
  /** The step these picks belong to; a new step starts clean. */
  step: string;
  /** What you're placing in the main phase. */
  mode: Kind | null;
  ghost: string | null;
  tile: number | null;
  victim: string | null;
}

/** The words for a moment, from public facts (and your own robbery card). */
function momentWords(
  m: Moment,
  name: (id: string | null) => string,
  stolen: CatanView['stolen'],
): { title: string; detail: string } {
  const card = stolen && stolen.seq === m.key ? RESOURCE_NAME[stolen.resource].toLowerCase() : null;
  if (m.kind === 'robbery')
    return m.outcome === 'win'
      ? { title: 'You took a card', detail: `From ${name(m.other)}${card ? `: ${card}` : ''}` }
      : m.outcome === 'loss'
        ? {
            title: `${name(m.who)} robbed you`,
            detail: card ? `They took your ${card}` : 'They took a card',
          }
        : { title: `${name(m.who)} robbed ${name(m.other)}`, detail: 'One card taken' };
  const award = m.kind === 'road' ? 'Longest Road' : 'Largest Army';
  if (m.outcome === 'win') return { title: `${award} is yours`, detail: 'Two more points' };
  if (m.outcome === 'loss')
    return {
      title: `You lost ${award}`,
      detail: m.who ? `${name(m.who)} has it now` : 'Nobody holds it now',
    };
  return { title: `${name(m.who)} takes ${award}`, detail: 'Two more points' };
}

export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  tableView,
  me,
  players: shellPlayers,
  sendAction,
  now,
  reactions,
}) => {
  const t = tableView as CatanTableView;
  const v = view as CatanView | null;
  const players = shellPlayers as ScreenPlayer[];
  const L = layout(t.size);
  const name = namer(players);
  const seated = !!me && t.seats.includes(me) && !!v;
  const myColour = me ? seatColour(me, t.seats) : 'var(--rule)';
  const hand: Cards = v?.hand ?? emptyCards();

  const step = `${t.turnSeq}.${t.phase}.${t.setup?.step ?? ''}.${t.setup?.corner ?? ''}.${t.roadsToBuild}`;
  const [picks, setPicks] = useState<Picks>({
    step,
    mode: null,
    ghost: null,
    tile: null,
    victim: null,
  });
  let p = picks;
  if (picks.step !== step) {
    p = { step, mode: null, ghost: null, tile: null, victim: null };
    setPicks(p);
  }
  const set = (patch: Partial<Picks>) => setPicks((x) => ({ ...x, ...patch }));

  const [busy, setBusy] = useState(false);
  const send = async (a: CatanAction) => {
    setBusy(true);
    try {
      return await sendAction(a);
    } finally {
      setBusy(false);
    }
  };
  const [sheet, setSheet] = useState<'build' | 'trade' | 'cards' | null>(null);
  const [counter, setCounter] = useState<Offer | null>(null);
  const [discardShut, setDiscardShut] = useState(-1);

  const acting = seated && t.actor === me && t.phase !== 'discard' && t.phase !== 'robber';
  const owe = me ? (t.discards[me] ?? 0) : 0;
  const robbing = seated && t.phase === 'robber' && t.robberBy === me;

  // What can be picked on the board right now.
  let corners: string[] = [];
  let edges: string[] = [];
  let kind: Kind | null = null;
  if (acting && me) {
    if (t.phase === 'setup') {
      const from = t.setup!.corner;
      if (from) {
        edges = roadSpots(L, t.buildings, t.roads, me, from);
        kind = 'road';
      } else {
        corners = settlementSpots(L, t.buildings, t.roads, me, true);
        kind = 'settlement';
      }
    } else if (t.phase === 'roadBuilding') {
      edges = roadSpots(L, t.buildings, t.roads, me);
      kind = 'road';
    } else if (t.phase === 'main' && p.mode) {
      kind = p.mode;
      if (p.mode === 'road') edges = roadSpots(L, t.buildings, t.roads, me);
      if (p.mode === 'settlement') corners = settlementSpots(L, t.buildings, t.roads, me, false);
      if (p.mode === 'city') corners = citySpots(t.buildings, me);
    }
  }
  const tiles = robbing && me ? robberSpots(t, me, (id) => t.points[id] ?? 0) : [];
  const ghost = p.ghost && (corners.includes(p.ghost) || edges.includes(p.ghost)) ? p.ghost : null;
  const tile = p.tile !== null && tiles.includes(p.tile) ? p.tile : null;
  const victims =
    tile !== null && me ? victimsAt(t, tile, me).filter((id) => (t.handCounts[id] ?? 0) > 0) : [];
  const victim =
    victims.length === 1 ? victims[0]! : victims.includes(p.victim ?? '') ? p.victim : null;

  const place = async () => {
    if (!ghost || !kind) return;
    if (await send({ type: 'build', kind, at: ghost })) set({ ghost: null, mode: null });
  };

  // Results you can feel: being robbed or robbing, an award changing hands.
  const [freshRob, dropRob] = useMoment(t.robbery?.seq ?? 0);
  const [freshAward, dropAward] = useMoment(t.award?.seq ?? 0);
  let moment: { m: Moment; done: () => void } | null = null;
  if (seated && freshRob) {
    const m = robberyMoment(t, me);
    if (m) moment = { m, done: dropRob };
  }
  if (!moment && seated && freshAward) {
    const m = awardMoment(t, me);
    if (m) moment = { m, done: dropAward };
  }
  const meP = players.find((x) => x.id === me);

  // The dock: what you can do now.
  let dock;
  const firstHalf = t.setup ? t.setup.step < t.setup.order.length / 2 : false;
  if (!seated) {
    dock = <p className="cn-hint">You’re watching. The game is played on the players’ phones.</p>;
  } else if (owe > 0) {
    dock = (
      <div className="cn-dock cn-dock--1">
        <p className="cn-hint">A 7! You hold more than 7 cards.</p>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          onClick={() => setDiscardShut(-1)}
        >
          Discard {owe}
        </button>
      </div>
    );
  } else if (t.phase === 'discard') {
    dock = (
      <p className="cn-hint">
        Waiting for {Object.keys(t.discards).map(name).join(' and ')} to discard.
      </p>
    );
  } else if (robbing) {
    dock = (
      <div className="cn-dock cn-dock--robber">
        <p className="cn-hint">
          {tile === null
            ? 'Tap a tile to move the robber there.'
            : victims.length > 1
              ? 'Who do you rob?'
              : victims.length === 1
                ? `You’ll take a card from ${name(victims[0])}.`
                : 'Nobody here has a card to take.'}
        </p>
        {victims.length > 1 && (
          <div className="cn-victims">
            {victims.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={victim === id}
                className={victim === id ? 'is-on' : ''}
                onClick={() => set({ victim: id })}
              >
                {name(id)} <small>{t.handCounts[id]} cards</small>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || tile === null || (victims.length > 1 && !victim)}
          onClick={() =>
            tile !== null && send({ type: 'robber', tile, victim: victims.length ? victim : null })
          }
        >
          Move the robber
        </button>
      </div>
    );
  } else if (acting && t.phase === 'setup') {
    dock = (
      <div className="cn-dock cn-dock--1">
        <p className="cn-hint">
          {kind === 'road'
            ? 'Now a road beside it.'
            : firstHalf
              ? 'Place your first settlement. Ringed corners are free.'
              : 'Place your second settlement. It takes a card from each tile it touches.'}
        </p>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || !ghost}
          onClick={place}
        >
          {ghost ? 'Place it here' : `Tap a ${kind === 'road' ? 'ringed edge' : 'ringed corner'}`}
        </button>
      </div>
    );
  } else if (acting && t.phase === 'roll') {
    const knight = v!.dev.some((d) => d.card === 'knight' && d.playable);
    dock = (
      <div className="cn-dock cn-dock--2">
        <button
          type="button"
          className="jd-plaque"
          disabled={!knight}
          onClick={() => setSheet('cards')}
        >
          {knight ? 'Play a knight' : `Cards ${v!.dev.length}`}
        </button>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy}
          onClick={() => send({ type: 'roll' })}
        >
          Roll the dice
        </button>
      </div>
    );
  } else if (acting && t.phase === 'roadBuilding') {
    dock = (
      <div className="cn-dock cn-dock--2">
        <p className="cn-hint">Free road: {t.roadsToBuild} to place. Tap a ringed edge.</p>
        <button
          type="button"
          className="jd-plaque"
          disabled={busy}
          onClick={() => send({ type: 'endRoads' })}
        >
          Stop here
        </button>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || !ghost}
          onClick={place}
        >
          Build here
        </button>
      </div>
    );
  } else if (acting && t.phase === 'main' && p.mode) {
    dock = (
      <div className="cn-dock cn-dock--2">
        <p className="cn-hint">
          {corners.length + edges.length
            ? `${corners.length + edges.length} places you can build. The ghost shows where it goes.`
            : 'There’s nowhere to build that right now.'}
        </p>
        <button
          type="button"
          className="jd-plaque"
          onClick={() => set({ mode: null, ghost: null })}
        >
          Cancel
        </button>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || !ghost}
          onClick={place}
        >
          Build here
        </button>
      </div>
    );
  } else if (acting && t.phase === 'main') {
    dock = (
      <div className="cn-dock cn-dock--4">
        <button type="button" className="jd-plaque" onClick={() => setSheet('build')}>
          Build
        </button>
        <button type="button" className="jd-plaque" onClick={() => setSheet('trade')}>
          Trade
        </button>
        <button type="button" className="jd-plaque" onClick={() => setSheet('cards')}>
          Cards {v!.dev.length}
        </button>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy}
          onClick={() => send({ type: 'endTurn' })}
        >
          End
        </button>
      </div>
    );
  } else {
    const canPropose = t.phase === 'main' && !t.paired && t.turn !== me;
    dock = (
      <div className="cn-dock cn-dock--2">
        <button type="button" className="jd-plaque" onClick={() => setSheet('cards')}>
          Cards {v!.dev.length}
        </button>
        <button
          type="button"
          className="jd-plaque"
          disabled={!canPropose}
          onClick={() => setSheet('trade')}
        >
          {canPropose ? `Trade with ${name(t.turn)}` : 'Trade'}
        </button>
      </div>
    );
  }

  const left = me ? piecesLeft(t.buildings, t.roads, me) : { road: 0, settlement: 0, city: 0 };
  const options = me
    ? buildOptions(
        hand,
        {
          road: roadSpots(L, t.buildings, t.roads, me).length,
          settlement: settlementSpots(L, t.buildings, t.roads, me, false).length,
          city: citySpots(t.buildings, me).length,
        },
        left,
        t.deckLeft,
      )
    : [];

  return (
    <div className="cn cn--phone">
      <TurnStrip t={t} me={me} players={players} now={now} myPoints={seated ? v!.points : null} />
      <Opponents t={t} me={me} players={players} reactions={reactions} />
      <div className="cn-stage">
        <CatanBoard
          board={t.board}
          buildings={t.buildings}
          roads={t.roads}
          robber={t.robber}
          seats={t.seats}
          corners={corners}
          edges={edges}
          tiles={tiles}
          ghost={ghost && kind ? { kind, at: ghost } : tile !== null ? null : null}
          ghostColour={myColour}
          roll={t.dice ? { total: t.dice[0] + t.dice[1], seq: t.rollSeq } : null}
          onCorner={(c) => set({ ghost: c })}
          onEdge={(e) => set({ ghost: e })}
          onTile={(i) => set({ tile: i, victim: null })}
          label="The island"
          pad={0.95}
        />
        {seated && me && (
          <OfferCard
            t={t}
            v={v!}
            me={me}
            players={players}
            send={send}
            busy={busy}
            onCounter={(o) => {
              setCounter(o);
              setSheet('trade');
            }}
          />
        )}
      </div>
      {seated && <Hand hand={hand} got={me ? (t.produced[me] ?? null) : null} gotKey={t.rollSeq} />}
      {dock}

      {seated && me && (
        <>
          <BuildSheet
            open={sheet === 'build'}
            onClose={() => setSheet(null)}
            options={options}
            seatColourOfMe={myColour}
            onPick={(k) => {
              setSheet(null);
              if (k === 'dev') void send({ type: 'buy' });
              else set({ mode: k, ghost: null });
            }}
          />
          {sheet === 'trade' && (
            <TradeSheet
              key={counter?.id ?? 'fresh'}
              open
              onClose={() => {
                setSheet(null);
                setCounter(null);
              }}
              t={t}
              v={v!}
              me={me}
              players={players}
              send={send}
              busy={busy}
              start={
                counter ? { give: counter.want, want: counter.give, counter: counter.id } : null
              }
            />
          )}
          <CardsSheet
            open={sheet === 'cards'}
            onClose={() => setSheet(null)}
            v={v!}
            send={send}
            busy={busy}
          />
          <DiscardSheet
            key={t.rollSeq}
            open={owe > 0 && discardShut !== t.rollSeq}
            onClose={() => setDiscardShut(t.rollSeq)}
            hand={hand}
            owe={owe}
            send={send}
            busy={busy}
          />
        </>
      )}
      {moment && (
        <VerdictMoment
          key={`${moment.m.kind}-${moment.m.key}`}
          outcome={moment.m.outcome}
          {...momentWords(moment.m, name, v?.stolen ?? null)}
          avatar={meP?.avatar}
          onDone={moment.done}
        />
      )}
    </div>
  );
};
