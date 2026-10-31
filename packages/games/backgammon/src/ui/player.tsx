'use client';

import { useState } from 'react';
import { Plaque, useTheme, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { diceLeft, nextSteps, playStep, pool, type Position, type Side, type Step } from '../board';
import type { BackgammonAction, BackgammonPlayerView } from '../rules';
import { locOf, Tables, type LocKey } from './table';
import {
  Clock,
  diceWords,
  endLine,
  lastLine,
  Log,
  MatchLine,
  Plate,
  tableStatus,
  useFlights,
  useGameEnd,
  type Name,
} from './parts';
import './backgammon.css';

/**
 * Backgammon on a phone: the tables turned so your home board is bottom right, your opponent's
 * plate above and yours below. On your turn you pick up a checker and set it down on a marked
 * point, one die at a time, with Undo, and send the whole turn with Done. A laptop puts the board
 * beside the plates and the last moves.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  now,
  reactions,
  ...props
}) => {
  const v = view as BackgammonPlayerView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name: Name = (id) => byId.get(id)?.name ?? 'Someone';
  const me: Side = v.side ?? 0;
  const foe: Side = me === 0 ? 1 : 0;

  const [draft, setDraft] = useState<Step[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // A new roll, a new turn or a new game drops whatever was half played.
  const turnKey = `${v.game}:${v.last?.seq ?? 0}:${v.phase}:${v.toAct ?? ''}`;
  const [tracked, setTracked] = useState(turnKey);
  if (tracked !== turnKey) {
    setTracked(turnKey);
    setDraft([]);
    setPicked(null);
  }

  const moving = v.side !== null && v.phase === 'move' && v.toAct === v.me && v.dice !== null;
  const dice = v.dice;
  let pos: Position = v.pos;
  if (moving) for (const step of draft) pos = playStep(pos, me, step).pos;
  const options = moving && dice ? nextSteps(v.pos, me, dice, draft) : [];
  const complete = moving && draft.length > 0 && options.length === 0;
  // The bar comes first, so it is picked up for you.
  const from = picked ?? (options.length > 0 && options.every((s) => s.from === 25) ? 25 : null);

  const movable = new Set<LocKey>(options.map((s) => locOf(me, s.from)));
  /** Where the picked checker may go, with the smallest die that takes it there. */
  const targets = new Map<LocKey, number>();
  if (from !== null) {
    for (const s of options.filter((o) => o.from === from).sort((a, b) => a.die - b.die)) {
      const key = locOf(me, s.from - s.die);
      if (!targets.has(key)) targets.set(key, s.die);
    }
  }

  const onLoc = (key: LocKey) => {
    if (from !== null && targets.has(key)) {
      const step = { from, die: targets.get(key)! };
      const next = [...draft, step];
      setDraft(next);
      // Keep hold of the checker if it can go on from where it landed.
      const landed = Math.max(0, from - step.die);
      const after = dice ? nextSteps(v.pos, me, dice, next) : [];
      setPicked(landed > 0 && after.some((s) => s.from === landed) ? landed : null);
      return;
    }
    const pip = options.find((s) => locOf(me, s.from) === key)?.from;
    if (pip === undefined) return;
    setPicked(picked === pip ? null : pip);
  };

  const send = async (action: BackgammonAction) => {
    setBusy(true);
    await sendAction(action);
    setBusy(false);
  };

  const flights = useFlights(v, moving ? me : v.side);
  const [ended, dismissEnd] = useGameEnd(v);

  // The dice on the board: spent ones first, faded.
  let shown: number[] | null = null;
  let spent = 0;
  if (v.phase === 'move' && dice && v.turn !== null) {
    if (moving) {
      const left = diceLeft(dice, draft);
      const all = pool(dice);
      const used = all.slice();
      for (const d of left) used.splice(used.indexOf(d), 1);
      shown = [...used, ...left];
      spent = used.length;
    } else shown = pool(dice);
  }

  const status = (() => {
    if (moving) {
      if (complete) return 'Done?';
      if (options.length === 0) return 'No move';
      return draft.length
        ? `Move ${diceWords(dice)}: ${diceLeft(dice!, draft).join(' ')} left`
        : `Move ${diceWords(dice)}`;
    }
    if (v.phase === 'roll' && v.toAct === v.me)
      return v.canDouble ? 'Roll, or double' : 'Your roll';
    if (v.phase === 'double' && v.toAct === v.me)
      return `${name(v.players[foe])} doubles to ${v.cube * 2}`;
    if (v.phase === 'double') return `Doubled to ${v.cube * 2}`;
    return tableStatus(v, name);
  })();

  const endOutcome = ended
    ? v.side === null
      ? 'reveal'
      : ended.winner === v.me
        ? 'win'
        : 'loss'
    : null;
  const matchOver = ended && v.winner !== null;

  return (
    <div className="bgm bgm--phone" data-look={look}>
      <header className="bgm-head">
        <h2 className="bgm-status">{status}</h2>
        <Clock at={v.actBy} now={now} />
      </header>

      <div className="bgm-main">
        <div className="bgm-side">
          <MatchLine t={v} />
          <Plate
            t={v}
            side={foe}
            player={byId.get(v.players[foe])}
            reactions={reactions}
            name={name}
          />
          <Plate
            t={v}
            side={me}
            player={byId.get(v.players[me])}
            reactions={reactions}
            name={name}
            you={v.side !== null}
          />
          <Log t={v} name={name} />
        </div>

        <div className="bgm-board">
          <Tables
            pos={pos}
            viewer={me}
            dice={shown}
            diceSide={v.turn}
            spent={spent}
            rollKey={v.last?.seq}
            cube={v.cube}
            cubeOwner={v.cubeOwner === null ? null : v.cubeOwner === v.players[0] ? 0 : 1}
            showCube={v.cubeOn && !v.crawford}
            movable={moving ? movable : undefined}
            selected={from === null ? null : locOf(me, from)}
            targets={moving ? new Set(targets.keys()) : undefined}
            onLoc={moving ? onLoc : undefined}
            flights={flights.flights}
            flightKey={flights.key}
            label={`The board. ${v.pips[me]} pips for you, ${v.pips[foe]} for ${name(v.players[foe])}.`}
          />
        </div>
        <div className="bgm-below">
          <Log t={v} name={name} rows={3} />
        </div>
      </div>

      <footer className="bgm-dock">
        {moving ? (
          <>
            <button
              type="button"
              className="bgm-btn"
              disabled={draft.length === 0 || busy}
              onClick={() => {
                setDraft(draft.slice(0, -1));
                setPicked(null);
              }}
            >
              Undo
            </button>
            <Plaque
              go
              disabled={!complete || busy}
              onClick={() => void send({ type: 'move', steps: draft })}
            >
              Done
            </Plaque>
          </>
        ) : v.phase === 'roll' && v.toAct === v.me ? (
          <>
            {v.canDouble && (
              <button
                type="button"
                className="bgm-btn bgm-btn--cube"
                disabled={busy}
                onClick={() => void send({ type: 'double' })}
              >
                Double to {v.cube * 2}
              </button>
            )}
            <Plaque go disabled={busy} onClick={() => void send({ type: 'roll' })}>
              Roll
            </Plaque>
          </>
        ) : v.phase === 'double' && v.toAct === v.me ? (
          <>
            <button
              type="button"
              className="bgm-btn"
              disabled={busy}
              onClick={() => void send({ type: 'drop' })}
            >
              Drop, lose {v.cube}
            </button>
            <Plaque go disabled={busy} onClick={() => void send({ type: 'take' })}>
              Take at {v.cube * 2}
            </Plaque>
          </>
        ) : v.phase === 'between' && v.side !== null ? (
          <>
            <p className="bgm-dock__line">{v.lastEnd ? endLine(v.lastEnd) : ''}</p>
            <Plaque go disabled={busy} onClick={() => void send({ type: 'next' })}>
              Next game
            </Plaque>
          </>
        ) : (
          <p className="bgm-dock__line" role="status">
            {lastLine(v.last, name)}
          </p>
        )}
      </footer>

      {ended && endOutcome && (
        <VerdictMoment
          key={`end-${ended.game}`}
          outcome={endOutcome}
          title={
            matchOver
              ? ended.winner === v.me
                ? 'You win the match'
                : `${name(ended.winner)} wins the match`
              : ended.winner === v.me
                ? `You win game ${ended.game}`
                : `${name(ended.winner)} wins game ${ended.game}`
          }
          detail={endLine(ended)}
          onDone={dismissEnd}
        />
      )}
    </div>
  );
};
