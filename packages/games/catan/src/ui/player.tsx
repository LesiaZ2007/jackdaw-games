'use client';

import { VerdictMoment, useMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { useEffect, useRef, useState } from 'react';
import { piecesLeft } from '../build';
import {
  PROGRESS_NAME,
  TRACKS,
  TRACK_GOOD,
  WALLS_EACH,
  canAct,
  knightMoves,
  knightsLeft,
  openRoad,
  type Progress,
} from '../ck';
import { awardMoment, robberyMoment, type Moment } from '../moments';
import {
  layoutOf,
  robberSpots,
  victimsAt,
  type CatanAction,
  type CatanTableView,
  type CatanView,
  type Offer,
} from '../rules';
import { pirateSpots, sailMoves, shipOwnersAt, shipsLeft } from '../sea';
import {
  citySpotsOf,
  knightSpotsOf,
  roadSpotsOf,
  settleSpotsOf,
  shipSpotsOf,
  wallSpotsOf,
} from '../spots';
import { YIELD, emptyCards, type Cards } from '../types';
import { CatanBoard } from './board';
import { CitySheet, PickSheet, ProgressSheet } from './cksheets';
import { namer } from './common';
import {
  BarbarianTrack,
  KnightsChip,
  Ledger,
  PointsMedal,
  PointsSheet,
  TrackTower,
} from './estate';
import { Pip } from './glyphs';
import { Tray } from './hand';
import { RESOURCE_NAME, seatColour } from './palette';
import {
  BuildSheet,
  CardsSheet,
  DiscardSheet,
  OfferCard,
  TradeSheet,
  TurnOfferCard,
  buildOptions,
  type Kind,
} from './sheets';
import { waitingForYou } from '../trade';
import { RollMoment } from './roll';
import { Opponents, TurnStrip } from './strip';
import './catan.css';
import './phone.css';
import './expansions.css';

interface Picks {
  /** The step these picks belong to; a new step starts clean. */
  step: string;
  /** What you're placing in the main phase. */
  mode: Kind | null;
  ghost: string | null;
  tile: number | null;
  victim: string | null;
  /** Cities & Knights: choosing a knight, the knight chosen, and choosing where it goes. */
  knights: boolean;
  knight: string | null;
  knightTo: boolean;
  /** Seafarers: choosing a ship to sail, and the ship chosen. */
  sailing: boolean;
  ship: string | null;
  /** A progress card waiting for a pick on the board, its rival, and the Inventor's tokens. */
  card: Progress | null;
  cardVictim: string | null;
  tiles2: number[];
}

const fresh = (step: string): Picks => ({
  step,
  mode: null,
  ghost: null,
  tile: null,
  victim: null,
  knights: false,
  knight: null,
  knightTo: false,
  sailing: false,
  ship: null,
  card: null,
  cardVictim: null,
  tiles2: [],
});

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

/** What a progress card asks you to tap on the board. */
const CARD_HINT: Partial<Record<Progress, string>> = {
  inventor: 'Tap two number tokens to swap (not 2, 12, 6 or 8).',
  engineer: 'Tap a city for the free wall.',
  medicine: 'Tap a settlement to make a city (2 ore, 1 grain).',
  merchant: 'Tap a tile beside your building for the merchant.',
  bishop: 'Tap a tile for the robber; you take a card from each player there.',
  diplomat: 'Tap an open road to remove it.',
  intrigue: 'Tap a rival knight on your road to send it away.',
  deserter: 'Tap where your new knight stands, or skip it.',
};

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
  const L = layoutOf(t);
  const name = namer(players);
  const seated = !!me && t.seats.includes(me) && !!v;
  const myColour = me ? seatColour(me, t.seats) : 'var(--rule)';
  const hand: Cards = v?.hand ?? emptyCards();
  const ck = t.ck;
  const sea = t.sea;

  const step = `${t.turnSeq}.${t.phase}.${t.setup?.step ?? ''}.${t.setup?.corner ?? ''}.${t.roadsToBuild}`;
  const [picks, setPicks] = useState<Picks>(fresh(step));
  let p = picks;
  if (picks.step !== step) {
    p = fresh(step);
    setPicks(p);
  }
  const set = (patch: Partial<Picks>) => setPicks((x) => ({ ...x, ...patch }));
  const clear = () => set({ ...fresh(step) });

  const [busy, setBusy] = useState(false);
  const send = async (a: CatanAction) => {
    setBusy(true);
    try {
      return await sendAction(a);
    } finally {
      setBusy(false);
    }
  };
  const [sheet, setSheet] = useState<
    'build' | 'trade' | 'cards' | 'city' | 'pick' | 'points' | null
  >(null);
  const [counter, setCounter] = useState<Offer | null>(null);
  const [discardShut, setDiscardShut] = useState(-1);
  // A phone can blow the island up to twice its size and pan it with a finger.
  const [zoomed, setZoomed] = useState(false);
  const island = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = island.current;
    if (!zoomed || !el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [zoomed]);

  const acting = seated && t.actor === me && t.phase !== 'discard' && t.phase !== 'robber';
  const canCommand = acting && t.phase === 'main' && !p.mode && !p.card && !p.sailing;
  const owe = me ? (t.discards[me] ?? 0) : 0;
  const robbing = seated && t.phase === 'robber' && t.robberBy === me;
  const owes = me ? (t.owed[me]?.length ?? 0) : 0;

  // What can be picked on the board right now.
  let corners: string[] = [];
  let edges: string[] = [];
  let kind: Kind | null = null;
  let roadSet = new Set<string>();
  let shipSet = new Set<string>();
  let cardTiles: number[] = [];
  const myKnights = ck ? Object.keys(ck.knights).filter((c) => ck.knights[c]!.owner === me) : [];
  const sails = me && sea ? sailMoves(L, t, me) : {};
  if (acting && me) {
    if (t.phase === 'setup') {
      const from = t.setup!.corner;
      if (from) {
        roadSet = new Set(roadSpotsOf(t, me, from));
        shipSet = new Set(shipSpotsOf(t, me, from));
        edges = [...new Set([...roadSet, ...shipSet])];
        kind = 'road';
      } else {
        corners = settleSpotsOf(t, me, true);
        kind = ck && t.setup!.step >= t.setup!.order.length / 2 ? 'city' : 'settlement';
      }
    } else if (t.phase === 'roadBuilding') {
      roadSet = new Set(piecesLeft(t.buildings, t.roads, me).road > 0 ? roadSpotsOf(t, me) : []);
      shipSet = new Set(sea && shipsLeft(sea, me) > 0 ? shipSpotsOf(t, me) : []);
      edges = [...new Set([...roadSet, ...shipSet])];
      kind = 'road';
    } else if (t.phase === 'main' && p.mode) {
      kind = p.mode;
      if (p.mode === 'road') edges = roadSpotsOf(t, me);
      if (p.mode === 'ship') edges = shipSpotsOf(t, me);
      if (p.mode === 'settlement') corners = settleSpotsOf(t, me, false);
      if (p.mode === 'city') corners = citySpotsOf(t, me);
      if (p.mode === 'knight') corners = knightSpotsOf(t, me);
      if (p.mode === 'wall') corners = wallSpotsOf(t, me);
    } else if (t.phase === 'main' && p.knights && ck) {
      corners = p.knight ? (p.knightTo ? knightMoves(L, t, p.knight) : []) : myKnights;
    } else if (t.phase === 'main' && ck && !p.sailing && !p.card) {
      // Nothing chosen yet: your knights answer a tap (2026-11-09: "I can't figure out how to
      // activate a knight").
      corners = myKnights;
    } else if (t.phase === 'main' && p.sailing) {
      edges = p.ship ? (sails[p.ship] ?? []) : Object.keys(sails);
      kind = p.ship ? 'ship' : null;
    } else if (t.phase === 'main' && p.card && ck) {
      const c = p.card;
      if (c === 'engineer') corners = wallSpotsOf(t, me);
      if (c === 'medicine')
        corners = Object.keys(t.buildings).filter(
          (x) => t.buildings[x]!.owner === me && !t.buildings[x]!.city,
        );
      if (c === 'intrigue')
        corners = Object.keys(ck.knights).filter(
          (x) => ck.knights[x]!.owner !== me && L.corners[x]!.edges.some((e) => t.roads[e] === me),
        );
      if (c === 'deserter') corners = knightSpotsOf(t, me);
      if (c === 'diplomat') edges = Object.keys(t.roads).filter((e) => openRoad(L, t, e));
      if (c === 'inventor')
        cardTiles = t.board.tiles.flatMap((x, i) =>
          x.number && ![2, 12, 6, 8].includes(x.number) ? [i] : [],
        );
      if (c === 'merchant')
        cardTiles = t.board.tiles.flatMap((x, i) =>
          YIELD[x.terrain] && L.tiles[i]!.corners.some((q) => t.buildings[q]?.owner === me)
            ? [i]
            : [],
        );
      if (c === 'bishop')
        cardTiles = t.board.tiles.flatMap((x, i) =>
          x.terrain !== 'sea' && i !== t.robber ? [i] : [],
        );
    }
  }
  const landTiles = robbing && me ? robberSpots(t, me, (id) => t.points[id] ?? 0) : [];
  const robberOn = !ck || ck.robberLive;
  const seaTiles = robbing && sea ? pirateSpots(t.board, sea.pirate) : [];
  const tiles = robbing ? [...(robberOn ? landTiles : []), ...seaTiles] : cardTiles;
  const ghost = p.ghost && (corners.includes(p.ghost) || edges.includes(p.ghost)) ? p.ghost : null;
  const tile = p.tile !== null && tiles.includes(p.tile) ? p.tile : null;
  const atSea = tile !== null && t.board.tiles[tile]!.terrain === 'sea';
  const victims =
    tile !== null && me && robbing
      ? (atSea ? shipOwnersAt(L, sea!.ships, tile, me) : victimsAt(t, tile, me)).filter(
          (id) => (t.handCounts[id] ?? 0) > 0,
        )
      : [];
  const victim =
    victims.length === 1 ? victims[0]! : victims.includes(p.victim ?? '') ? p.victim : null;
  // On a coast in the opening or with free roads, an edge may take a road or a ship.
  const both = ghost !== null && roadSet.has(ghost) && shipSet.has(ghost);
  const edgeKind: Kind | null =
    ghost !== null && shipSet.has(ghost) && !roadSet.has(ghost) ? 'ship' : kind;

  // The piece the ghost shows.
  const ghostKind: Kind | null = p.knightTo
    ? 'knight'
    : p.card
      ? (({ deserter: 'knight', engineer: 'wall', medicine: 'city', diplomat: 'road' } as const)[
          p.card as 'deserter'
        ] ?? null)
      : (edgeKind ?? kind);

  const place = async (k: Kind | null = edgeKind) => {
    if (!ghost || !k) return;
    if (await send({ type: 'build', kind: k, at: ghost })) set({ ghost: null, mode: null });
  };

  const onCorner = (c: string) => {
    if (p.knights && !p.knight) set({ knight: c, ghost: null });
    else if (!p.knights && !p.mode && myKnights.includes(c))
      set({ ...fresh(step), knights: true, knight: c });
    else set({ ghost: c });
  };
  const onEdge = (e: string) => {
    if (p.sailing && !p.ship) set({ ship: e, ghost: null });
    else set({ ghost: e });
  };
  const onTile = (i: number) => {
    if (p.card === 'inventor') {
      const has = p.tiles2.includes(i);
      set({ tiles2: has ? p.tiles2.filter((x) => x !== i) : [...p.tiles2.slice(-1), i] });
    } else set({ tile: i, victim: null });
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
  // Cities & Knights: the barbarians landing takes the screen.
  const [freshAttack, dropAttack] = useMoment(ck?.attack?.seq ?? 0);
  const attack = freshAttack && ck?.attack && seated && me ? ck.attack : null;
  const meP = players.find((x) => x.id === me);
  // Each roll takes the screen for a moment, then the dice glide into the strip.
  const [rolling, rolled] = useMoment(t.rollSeq);

  const chosenKnight = p.knight && ck ? ck.knights[p.knight] : null;

  // The dock: what you can do now.
  let dock;
  const firstHalf = t.setup ? t.setup.step < t.setup.order.length / 2 : false;
  if (!seated) {
    dock = <p className="ctn-hint">You’re watching. The game is played on the players’ phones.</p>;
  } else if (owes > 0) {
    dock = (
      <div className="ctn-dock ctn-dock--1">
        <p className="ctn-hint">You have a choice to make.</p>
        <button type="button" className="jd-plaque jd-plaque--go" onClick={() => setSheet('pick')}>
          Choose
        </button>
      </div>
    );
  } else if (t.phase === 'pick') {
    dock = (
      <p className="ctn-hint">
        Waiting for {Object.keys(t.owed).map(name).join(' and ')} to choose.
      </p>
    );
  } else if (owe > 0) {
    dock = (
      <div className="ctn-dock ctn-dock--1">
        <p className="ctn-hint">You hold too many cards.</p>
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
      <p className="ctn-hint">
        Waiting for {Object.keys(t.discards).map(name).join(' and ')} to discard.
      </p>
    );
  } else if (robbing) {
    dock = (
      <div className="ctn-dock ctn-dock--robber">
        <p className="ctn-hint">
          {tile === null
            ? sea
              ? robberOn
                ? 'Tap a land tile for the robber, or the sea for the pirate.'
                : 'Tap the sea to move the pirate.'
              : 'Tap a tile to move the robber there.'
            : victims.length > 1
              ? 'Who do you rob?'
              : victims.length === 1
                ? `You’ll take a card from ${name(victims[0])}.`
                : 'Nobody here has a card to take.'}
        </p>
        {victims.length > 1 && (
          <div className="ctn-victims">
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
            tile !== null &&
            send({
              type: atSea ? 'pirate' : 'robber',
              tile,
              victim: victims.length ? victim : null,
            })
          }
        >
          {atSea ? 'Move the pirate' : 'Move the robber'}
        </button>
      </div>
    );
  } else if (acting && t.phase === 'setup') {
    dock = (
      <div className={both ? 'ctn-dock ctn-dock--2' : 'ctn-dock ctn-dock--1'}>
        <p className="ctn-hint">
          {kind === 'road'
            ? sea
              ? 'Now a road beside it, or a ship on the coast.'
              : 'Now a road beside it.'
            : kind === 'city'
              ? 'Place your city. It takes a card from each tile it touches.'
              : firstHalf
                ? 'Place your first settlement. Ringed corners are free.'
                : 'Place your second settlement. It takes a card from each tile it touches.'}
        </p>
        {both ? (
          <>
            <button
              type="button"
              className="jd-plaque"
              disabled={busy}
              onClick={() => place('ship')}
            >
              Ship here
            </button>
            <button
              type="button"
              className="jd-plaque jd-plaque--go"
              disabled={busy}
              onClick={() => place('road')}
            >
              Road here
            </button>
          </>
        ) : (
          <button
            type="button"
            className="jd-plaque jd-plaque--go"
            disabled={busy || !ghost}
            onClick={() => place()}
          >
            {ghost ? 'Place it here' : `Tap a ${kind === 'road' ? 'ringed edge' : 'ringed corner'}`}
          </button>
        )}
      </div>
    );
  } else if (acting && t.phase === 'roll') {
    const knight = v!.dev.some((d) => d.card === 'knight' && d.playable);
    const alchemist = v!.progress.some((d) => d.card === 'alchemist' && d.playable);
    dock = (
      <div className="ctn-dock ctn-dock--2">
        {ck ? (
          <button
            type="button"
            className="jd-plaque"
            disabled={!alchemist}
            onClick={() => setSheet('cards')}
          >
            {alchemist ? (
              'Play the Alchemist'
            ) : (
              <>
                Cards <b className="ctn-count">{v!.progress.length}</b>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            className="jd-plaque"
            disabled={!knight}
            onClick={() => setSheet('cards')}
          >
            {knight ? (
              'Play a knight'
            ) : (
              <>
                Cards <b className="ctn-count">{v!.dev.length}</b>
              </>
            )}
          </button>
        )}
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
      <div className={both ? 'ctn-dock ctn-dock--3' : 'ctn-dock ctn-dock--2'}>
        <p className="ctn-hint">
          Free {sea ? 'road or ship' : 'road'}: {t.roadsToBuild} to place. Tap a ringed edge.
        </p>
        <button
          type="button"
          className="jd-plaque"
          disabled={busy}
          onClick={() => send({ type: 'endRoads' })}
        >
          Stop here
        </button>
        {both && (
          <button type="button" className="jd-plaque" disabled={busy} onClick={() => place('ship')}>
            Ship here
          </button>
        )}
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || !ghost}
          onClick={() => place(both ? 'road' : edgeKind)}
        >
          {both ? 'Road here' : 'Build here'}
        </button>
      </div>
    );
  } else if (acting && t.phase === 'main' && p.mode) {
    dock = (
      <div className="ctn-dock ctn-dock--2">
        <p className="ctn-hint">
          {corners.length + edges.length
            ? `${corners.length + edges.length} places you can build. The ghost shows where it goes.`
            : 'There’s nowhere to build that right now.'}
        </p>
        <button type="button" className="jd-plaque" onClick={clear}>
          Cancel
        </button>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || !ghost}
          onClick={() => place(p.mode)}
        >
          Build here
        </button>
      </div>
    );
  } else if (acting && t.phase === 'main' && p.knights && ck && me) {
    const k = chosenKnight;
    const ready = !!k && canAct(k, t.turnSeq);
    const promoteTo = k && k.level < 3 ? k.level + 1 : null;
    const canPromote =
      !!k &&
      !!promoteTo &&
      k.promoted !== t.turnSeq &&
      (promoteTo < 3 || ck.levels[me]!.politics >= 3) &&
      knightsLeft(ck, me)[promoteTo as 1 | 2 | 3] > 0;
    const nearRobber = !!p.knight && ck.robberLive && L.tiles[t.robber]!.corners.includes(p.knight);
    dock = !k ? (
      <div className="ctn-dock ctn-dock--1">
        <p className="ctn-hint">Tap one of your knights on the island.</p>
        <button type="button" className="jd-plaque" onClick={clear}>
          Done
        </button>
      </div>
    ) : p.knightTo ? (
      <div className="ctn-dock ctn-dock--2">
        <p className="ctn-hint">
          {corners.length
            ? 'Tap where it goes. A weaker rival knight there is sent away.'
            : 'It can’t reach anywhere along your roads.'}
        </p>
        <button type="button" className="jd-plaque" onClick={() => set({ knightTo: false })}>
          Back
        </button>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || !ghost}
          onClick={async () => {
            if (ghost && (await send({ type: 'knight', from: p.knight!, to: ghost }))) clear();
          }}
        >
          Go here
        </button>
      </div>
    ) : (
      <div className="ctn-dock ctn-dock--4">
        <p className="ctn-hint">
          {['Basic', 'Strong', 'Mighty'][k.level - 1]} knight,{' '}
          {k.active
            ? ready
              ? 'active: it defends, and can move or chase the robber.'
              : 'activated this turn: it defends, and acts next turn.'
            : 'not active: it can’t defend or act until you activate it with 1 grain.'}
        </p>
        <button type="button" className="jd-plaque" onClick={() => set({ knight: null })}>
          Back
        </button>
        {k.active ? (
          <button
            type="button"
            className="jd-plaque"
            disabled={busy || !ready}
            onClick={() => set({ knightTo: true, ghost: null })}
          >
            Move
          </button>
        ) : (
          <button
            type="button"
            className="jd-plaque"
            disabled={busy || (hand.grain ?? 0) < 1}
            onClick={() => send({ type: 'activate', at: p.knight! })}
          >
            Activate <Pip res="grain" />
          </button>
        )}
        <button
          type="button"
          className="jd-plaque"
          disabled={
            busy || !canPromote || (ck.smith < 1 && ((hand.wool ?? 0) < 1 || (hand.ore ?? 0) < 1))
          }
          onClick={() => send({ type: 'promote', at: p.knight! })}
        >
          {ck.smith > 0 ? 'Promote free' : 'Promote'}
        </button>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || !ready || !nearRobber}
          onClick={() => send({ type: 'chase', from: p.knight! })}
        >
          Chase robber
        </button>
      </div>
    );
  } else if (acting && t.phase === 'main' && p.sailing) {
    dock = (
      <div className="ctn-dock ctn-dock--2">
        <p className="ctn-hint">
          {p.ship ? 'Tap where the ship sails to.' : 'Tap the ship at the open end of a line.'}
        </p>
        <button type="button" className="jd-plaque" onClick={clear}>
          Cancel
        </button>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || !p.ship || !ghost}
          onClick={async () => {
            if (p.ship && ghost && (await send({ type: 'sail', from: p.ship, to: ghost }))) clear();
          }}
        >
          Sail here
        </button>
      </div>
    );
  } else if (acting && t.phase === 'main' && p.card) {
    const c = p.card;
    const ready =
      c === 'inventor'
        ? p.tiles2.length === 2
        : c === 'merchant' || c === 'bishop'
          ? tile !== null
          : c === 'deserter'
            ? true
            : !!ghost;
    const go = async () => {
      const a: CatanAction = {
        type: 'progress',
        card: c,
        ...(c === 'inventor' ? { tiles: [p.tiles2[0]!, p.tiles2[1]!] as [number, number] } : {}),
        ...((c === 'merchant' || c === 'bishop') && tile !== null ? { tile } : {}),
        ...(ghost ? { at: ghost } : {}),
        ...(p.cardVictim ? { victim: p.cardVictim } : {}),
      };
      if (await send(a)) clear();
    };
    dock = (
      <div className="ctn-dock ctn-dock--2">
        <p className="ctn-hint">{CARD_HINT[c]}</p>
        <button type="button" className="jd-plaque" onClick={clear}>
          Cancel
        </button>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || !ready}
          onClick={go}
        >
          {c === 'deserter' && !ghost ? 'Skip placing' : PROGRESS_NAME[c]}
        </button>
      </div>
    );
  } else if (acting && t.phase === 'main') {
    const offers = me ? waitingForYou(t.offers, me).length : 0;
    dock = (
      <div className={ck ? 'ctn-dock ctn-dock--5' : 'ctn-dock ctn-dock--4'}>
        <button type="button" className="jd-plaque" onClick={() => setSheet('build')}>
          Build
        </button>
        <button type="button" className="jd-plaque" onClick={() => setSheet('trade')}>
          Trade
          {offers > 0 && <b className="ctn-count ctn-count--go">{offers}</b>}
        </button>
        {ck && (
          <button type="button" className="jd-plaque" onClick={() => setSheet('city')}>
            City
          </button>
        )}
        <button type="button" className="jd-plaque" onClick={() => setSheet('cards')}>
          Cards <b className="ctn-count">{ck ? v!.progress.length : v!.dev.length}</b>
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
      <div className="ctn-dock ctn-dock--2">
        <button type="button" className="jd-plaque" onClick={() => setSheet('cards')}>
          Cards <b className="ctn-count">{ck ? v!.progress.length : v!.dev.length}</b>
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
  const kinds: (Kind | 'dev')[] = [
    'road',
    ...(sea ? (['ship'] as const) : []),
    'settlement',
    'city',
    ...(ck ? (['knight', 'wall'] as const) : (['dev'] as const)),
  ];
  const options = me
    ? buildOptions(
        hand,
        {
          road: roadSpotsOf(t, me).length,
          settlement: settleSpotsOf(t, me, false).length,
          city: citySpotsOf(t, me).length,
          ship: shipSpotsOf(t, me).length,
          knight: knightSpotsOf(t, me).length,
          wall: wallSpotsOf(t, me).length,
        },
        {
          ...left,
          ship: sea ? shipsLeft(sea, me) : 0,
          knight: ck ? knightsLeft(ck, me)[1] : 0,
          wall: ck ? WALLS_EACH - ck.walls.filter((c) => t.buildings[c]?.owner === me).length : 0,
        },
        t.deckLeft,
        kinds,
      )
    : [];
  const sailable = Object.keys(sails).length > 0 && !t.paired;

  return (
    <div className="ctn ctn--phone">
      <TurnStrip
        t={t}
        me={me}
        players={players}
        now={now}
        myPoints={null}
        diceWaiting={rolling !== null}
      />
      {rolling !== null && t.dice && (
        <RollMoment
          key={rolling}
          dice={t.dice}
          event={ck?.event ?? null}
          robberSleeps={!!ck && !ck.robberLive}
          seq={t.rollSeq}
          target=".ctn-strip .ctn-dice"
          onDone={rolled}
        />
      )}
      <Opponents t={t} me={me} players={players} reactions={reactions} />
      <div className={ck ? 'ctn-stage ctn-stage--voyage' : 'ctn-stage'}>
        {ck && <BarbarianTrack t={t} />}
        <div ref={island} className={zoomed ? 'ctn-island is-zoomed' : 'ctn-island'}>
          <CatanBoard
            board={t.board}
            buildings={t.buildings}
            roads={t.roads}
            robber={t.robber}
            seats={t.seats}
            corners={corners}
            edges={edges}
            tiles={tiles}
            ghost={ghost && ghostKind ? { kind: ghostKind, at: ghost } : null}
            ghostColour={myColour}
            roll={t.dice ? { total: t.dice[0] + t.dice[1], seq: t.rollSeq } : null}
            onCorner={onCorner}
            onEdge={onEdge}
            onTile={onTile}
            label="The island"
            pad={0.95}
            ships={sea?.ships}
            pirate={sea?.pirate ?? null}
            knights={ck?.knights}
            walls={ck?.walls}
            metros={ck?.metros}
            merchant={ck?.merchant ?? null}
            chosen={p.knight ?? (p.card === 'intrigue' ? ghost : null)}
            chosenEdge={p.ship}
            picked={p.card === 'inventor' ? p.tiles2 : tile !== null ? [tile] : []}
            tileVerb={p.card ? 'Pick' : 'Move the robber to'}
          />
        </div>
        <button
          type="button"
          className="ctn-zoom"
          aria-pressed={zoomed}
          aria-label={zoomed ? 'Show the whole island' : 'Zoom in on the island'}
          onClick={() => setZoomed((z) => !z)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10" cy="10" r="6.5" />
            <path d="M15 15l6 6" />
            <path d="M7 10h6" />
            {!zoomed && <path d="M10 7v6" />}
          </svg>
        </button>
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
        {seated && me && !p.mode && (
          <TurnOfferCard
            t={t}
            v={v!}
            me={me}
            players={players}
            send={send}
            busy={busy}
            onOpen={() => setSheet('trade')}
          />
        )}
      </div>
      {seated && me && (
        <Ledger
          t={t}
          v={v!}
          me={me}
          colour={myColour}
          onPoints={() => setSheet('points')}
          onKnights={() => set({ ...fresh(step), knights: true })}
          canCommand={canCommand}
        />
      )}
      {seated && (
        <Tray
          hand={hand}
          got={me ? (t.produced[me] ?? null) : null}
          gotKey={t.rollSeq}
          dev={ck ? undefined : v!.dev}
          progress={ck ? v!.progress : undefined}
          onCards={() => setSheet('cards')}
          left={ck ? ck.deckLeft : t.deckLeft}
          lead={me ? <PointsMedal t={t} v={v!} onPoints={() => setSheet('points')} /> : null}
          tail={
            ck && me ? (
              <KnightsChip
                t={t}
                me={me}
                onKnights={() => set({ ...fresh(step), knights: true })}
                canCommand={canCommand}
              />
            ) : null
          }
          towers={
            ck && me
              ? Object.fromEntries(
                  TRACKS.map((track) => [
                    TRACK_GOOD[track],
                    <TrackTower
                      key={track}
                      t={t}
                      v={v!}
                      me={me}
                      track={track}
                      live={acting && t.phase === 'main'}
                      onCity={() => setSheet('city')}
                    />,
                  ]),
                )
              : undefined
          }
        />
      )}
      {dock}

      {seated && me && (
        <>
          <PointsSheet
            open={sheet === 'points'}
            onClose={() => setSheet(null)}
            t={t}
            v={v!}
            me={me}
            colour={myColour}
          />
          <BuildSheet
            open={sheet === 'build'}
            onClose={() => setSheet(null)}
            options={options}
            seatColourOfMe={myColour}
            onPick={(k) => {
              setSheet(null);
              if (k === 'dev') void send({ type: 'buy' });
              else set({ ...fresh(step), mode: k });
            }}
            extra={
              sea ? (
                <button
                  type="button"
                  className="jd-plaque ctn-wide"
                  disabled={!sailable}
                  onClick={() => {
                    setSheet(null);
                    set({ ...fresh(step), sailing: true });
                  }}
                >
                  {sea.moved
                    ? 'You’ve sailed a ship this turn'
                    : sailable
                      ? 'Sail a ship'
                      : 'No ship can sail now'}
                </button>
              ) : null
            }
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
          {ck ? (
            <>
              <ProgressSheet
                open={sheet === 'cards'}
                onClose={() => setSheet(null)}
                t={t}
                v={v!}
                me={me}
                name={name}
                send={send}
                busy={busy}
                onBoard={(card, victim) =>
                  set({ ...fresh(step), card, cardVictim: victim ?? null })
                }
              />
              <CitySheet
                open={sheet === 'city'}
                onClose={() => setSheet(null)}
                t={t}
                v={v!}
                me={me}
                send={send}
                busy={busy}
                onKnights={() => set({ ...fresh(step), knights: true })}
              />
            </>
          ) : (
            <CardsSheet
              open={sheet === 'cards'}
              onClose={() => setSheet(null)}
              v={v!}
              send={send}
              busy={busy}
            />
          )}
          {owes > 0 && (
            <PickSheet
              key={`${t.rollSeq}-${owes}`}
              open={sheet === 'pick'}
              onClose={() => setSheet(null)}
              t={t}
              me={me}
              send={send}
              busy={busy}
            />
          )}
          <DiscardSheet
            key={t.rollSeq}
            open={owe > 0 && discardShut !== t.rollSeq}
            onClose={() => setDiscardShut(t.rollSeq)}
            hand={hand}
            owe={owe}
            send={send}
            busy={busy}
            why={t.dice && t.dice[0] + t.dice[1] !== 7 ? 'The Saboteur struck' : 'A 7 was rolled'}
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
      {!moment && attack && me && (
        <VerdictMoment
          key={`attack-${attack.seq}`}
          outcome={
            attack.lost.includes(me)
              ? 'loss'
              : attack.defender === me || attack.tied.includes(me)
                ? 'win'
                : 'reveal'
          }
          title={
            attack.lost.includes(me)
              ? 'The barbarians took a city'
              : attack.defender === me
                ? 'Defender of Catan'
                : attack.won
                  ? 'The barbarians are beaten'
                  : 'The barbarians win'
          }
          detail={`Knights ${Object.values(attack.defence).reduce((a, b) => a + b, 0)} against ${attack.strength} ${attack.strength === 1 ? 'city' : 'cities'}${attack.defender === me ? ': a point for you' : ''}`}
          avatar={meP?.avatar}
          onDone={dropAttack}
        />
      )}
    </div>
  );
};
