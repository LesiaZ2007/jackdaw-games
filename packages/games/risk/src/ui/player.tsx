'use client';

import {
  Sheet,
  Toast,
  Token,
  VerdictMoment,
  useMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { useState } from 'react';
import { attackTargets, reachable } from '../board';
import { allSets } from '../cards';
import { getMap } from '../maps';
import { battleMoment, type Moment } from '../moments';
import { seen } from '../fog';
import type { RiskAction, RiskTableView, RiskView } from '../rules';
import { CardsSheet, MissionSheet } from './cards';
import { Continents, DiceStrip, PHASE_LABEL, TurnClock, namer } from './common';
import { armyColour } from './armies';
import { AttackDock, FortifyDock, OccupyDock, PlaceDock, WaitDock } from './dock';
import { RiskMap } from './map';
import { Orders, useOrders } from './orders';
import './risk.css';

interface Picks {
  /** The step these picks belong to; a new step starts clean. */
  step: string;
  from: string | null;
  to: string | null;
  n: number;
  /** Armies staged for placing, one territory per army, in the order tapped. */
  staged: string[];
}

export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  tableView,
  me,
  players: shellPlayers,
  sendAction,
  now,
}) => {
  const v = view as RiskView | null;
  // In fog of war, your own sight laid over the fogged table.
  const t = seen(tableView as RiskTableView, v);
  const players = shellPlayers as ScreenPlayer[];
  const map = getMap(t.map);
  const name = namer(players);
  const hand = v?.hand ?? [];
  const meP = players.find((p) => p.id === me);
  const out = !!me && t.eliminated.includes(me);
  const myTurn = !!me && t.turn === me && t.phase !== 'draft' && t.phase !== 'over' && !out;
  const drafting = t.phase === 'draft' && !!v && v.draftLeft > 0 && !v.draft;

  const step = `${t.round}.${t.turn}.${t.phase}.${t.toPlace}`;
  const [picks, setPicks] = useState<Picks>({ step, from: null, to: null, n: 1, staged: [] });
  // A new step (turn, phase, or more armies after a trade) starts clean.
  let p = picks;
  if (picks.step !== step) {
    p = { step, from: null, to: null, n: 1, staged: [] };
    setPicks(p);
  }
  const set = (patch: Partial<Picks>) => setPicks((x) => ({ ...x, ...patch }));

  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'cards' | 'mission' | 'continents' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const send = async (a: RiskAction) => {
    setBusy(true);
    try {
      return await sendAction(a);
    } finally {
      setBusy(false);
    }
  };

  const placing = drafting || (myTurn && t.phase === 'reinforce');
  const total = drafting ? v!.draftLeft : t.toPlace;
  const staged: Record<string, number> = {};
  for (const id of p.staged) staged[id] = (staged[id] ?? 0) + 1;
  const mustTrade = myTurn && t.phase === 'reinforce' && hand.length >= 5;

  // Only valid picks count: a roll can leave the attacker with 1 army, or take the target.
  const from =
    p.from && me && t.owner[p.from] === me && (t.phase !== 'attack' || t.armies[p.from]! >= 2)
      ? p.from
      : null;
  const targets =
    !myTurn || !from || !me
      ? []
      : t.phase === 'attack'
        ? attackTargets(map, t.owner, t.armies, me, from)
        : t.phase === 'fortify'
          ? reachable(map, t.owner, me, from)
          : [];
  const to = p.to && targets.includes(p.to) ? p.to : null;

  const onPick = (id: string) => {
    if (!me) return;
    const mineHere = t.owner[id] === me;
    if (placing) {
      if (mustTrade) return setSheet('cards');
      if (!mineHere) return setNote('Place armies on your own territories.');
      if (p.staged.length < total) set({ staged: [...p.staged, id] });
      return;
    }
    if (!myTurn) return;
    if (t.phase === 'attack') {
      if (from && targets.includes(id)) return set({ to: id });
      if (!mineHere) return setNote('Pick one of your territories to attack from first.');
      if (t.armies[id]! < 2) return setNote('You need at least 2 armies there to attack.');
      return set({ from: id, to: null });
    }
    if (t.phase === 'fortify') {
      if (from && targets.includes(id)) return set({ to: id, n: t.armies[from]! - 1 });
      if (!mineHere || t.armies[id]! < 2)
        return setNote('Pick one of your territories with 2 or more armies.');
      return set({ from: id, to: null });
    }
  };

  const placed = async () => {
    const placements = { ...staged };
    if (await send(drafting ? { type: 'draft', placements } : { type: 'reinforce', placements }))
      set({ staged: [] });
  };

  // Results you can feel: a settled battle you were in, or being knocked out.
  const [freshBattle, dismissBattle] = useMoment(t.battle?.ended ? t.battle.seq : 0);
  const [freshOut, dismissOut] = useMoment(t.eliminated.length);
  let moment: (Moment & { done: () => void }) | null = null;
  if (freshOut && me && t.eliminated[t.eliminated.length - 1] === me && t.phase !== 'over')
    moment = {
      outcome: 'loss',
      title: 'Knocked out',
      detail: t.battle
        ? `${name(t.battle.attacker)} took your last territory`
        : 'You’re out of the game',
      done: dismissOut,
    };
  else if (freshBattle) {
    const m = battleMoment(t.battle, me, map, name);
    if (m) moment = { ...m, done: dismissBattle };
  }

  const turnP = players.find((x) => x.id === t.turn);
  const [ordersOpen, closeOrders] = useOrders(t, me);
  const waitingDraft = t.seats.filter((x) => !t.draftDone.includes(x)).map(name);

  let dock;
  if (out) dock = <WaitDock title="You’re out" hint="Watch the rest of the war from here." />;
  else if (t.phase === 'draft')
    dock = drafting ? (
      <PlaceDock
        draft
        total={total}
        staged={p.staged}
        onUndo={() => set({ staged: p.staged.slice(0, -1) })}
        onDone={placed}
        busy={busy}
        mustTrade={false}
        canTrade={false}
        onCards={() => setSheet('cards')}
      />
    ) : (
      <WaitDock title="Your armies are placed" hint={`Waiting for ${waitingDraft.join(', ')}.`} />
    );
  else if (!myTurn)
    dock = (
      <WaitDock
        title={`${name(t.turn)} is playing`}
        hint={`${PHASE_LABEL[t.phase]}. Your turn comes round in seat order.`}
      />
    );
  else if (t.phase === 'reinforce')
    dock = (
      <PlaceDock
        total={total}
        staged={p.staged}
        onUndo={() => set({ staged: p.staged.slice(0, -1) })}
        onDone={placed}
        busy={busy}
        mustTrade={mustTrade}
        canTrade={allSets(hand).length > 0}
        onCards={() => setSheet('cards')}
      />
    );
  else if (t.phase === 'attack')
    dock = (
      <AttackDock
        t={t}
        map={map}
        from={from}
        to={to}
        busy={busy}
        send={send}
        onCancel={() => set(to ? { to: null } : { from: null })}
      />
    );
  else if (t.phase === 'occupy')
    dock = <OccupyDock key={t.battle?.seq} t={t} map={map} busy={busy} send={send} />;
  else if (t.phase === 'fortify')
    dock = (
      <FortifyDock
        t={t}
        map={map}
        from={from}
        to={to}
        n={Math.min(p.n, from ? t.armies[from]! - 1 : 1)}
        setN={(n) => set({ n })}
        busy={busy}
        send={send}
        onCancel={() => set(to ? { to: null } : { from: null })}
      />
    );

  return (
    <div className="rk rk--phone">
      <header className="rk__head">
        <p className="rk-turn">
          {t.phase === 'draft' ? (
            <span className="rk-turn__who">Everyone places armies</span>
          ) : (
            <>
              {turnP && <Token avatar={turnP.avatar} size={26} />}
              <span
                className="rk-turn__army"
                aria-hidden="true"
                style={{ background: armyColour(t.turn, t.seats) }}
              />
              <span className="rk-turn__who">
                {t.turn === me ? 'Your turn' : `${name(t.turn)}’s turn`}
              </span>
              <span className="rk-turn__phase">{PHASE_LABEL[t.phase]}</span>
            </>
          )}
          <TurnClock at={t.actBy} now={now} />
        </p>
        <nav className="rk-tools" aria-label="Your things">
          <button type="button" className="rk-tool" onClick={() => setSheet('cards')}>
            Cards <b>{hand.length}</b>
          </button>
          {v?.mission && (
            <button type="button" className="rk-tool" onClick={() => setSheet('mission')}>
              Mission
            </button>
          )}
          <button type="button" className="rk-tool" onClick={() => setSheet('continents')}>
            Continents
          </button>
        </nav>
      </header>
      <DiceStrip battle={t.battle} map={map} players={players} seats={t.seats} />
      <div className="rk-stage">
        <RiskMap
          map={map}
          owner={t.owner}
          armies={t.armies}
          seats={t.seats}
          selected={from}
          targets={to ? [to] : targets}
          staged={placing ? staged : (v?.draft ?? undefined)}
          flash={t.battle?.ended ? t.battle.to : null}
          onPick={onPick}
          fog={t.fog}
          zoomable
        />
      </div>
      {dock}
      <CardsSheet
        open={sheet === 'cards'}
        onClose={() => setSheet(null)}
        hand={hand}
        map={map}
        mode={t.cardSets}
        setsTraded={t.setsTraded}
        canTrade={myTurn && t.phase === 'reinforce'}
        onTrade={(cards) => send({ type: 'trade', cards })}
      />
      {v?.mission && (
        <MissionSheet
          open={sheet === 'mission'}
          onClose={() => setSheet(null)}
          mission={v.mission}
          map={map}
          nameOf={name}
        />
      )}
      <Sheet
        open={sheet === 'continents'}
        onClose={() => setSheet(null)}
        title="Continents"
        className="rk-sheet"
      >
        <p className="rk-sheet__note">Hold every territory in one to get its bonus each turn.</p>
        <Continents map={map} t={t} players={players} />
      </Sheet>
      <Toast message={note} onDone={() => setNote(null)} />
      {ordersOpen && me && (
        <Orders
          t={t}
          me={me}
          mission={v?.mission ?? null}
          map={map}
          players={players}
          nameOf={name}
          onClose={closeOrders}
        />
      )}
      {moment && (
        <VerdictMoment
          key={`${t.battle?.seq}-${t.eliminated.length}`}
          outcome={moment.outcome}
          title={moment.title}
          detail={moment.detail}
          avatar={meP?.avatar}
          onDone={moment.done}
        />
      )}
    </div>
  );
};
