'use client';

import { OutcomeChip, Token, useCountdown, type ScreenPlayer } from '@jackdaw/ui';
import { useEffect, useState } from 'react';
import { NEUTRAL, continentsHeld } from '../board';
import type { MapDef } from '../maps';
import { beaten } from '../moments';
import type { Battle, Phase, RiskTableView } from '../rules';
import { armyColour } from './armies';

export const PHASE_LABEL: Record<Phase, string> = {
  draft: 'Placing armies',
  reinforce: 'Reinforce',
  attack: 'Attack',
  occupy: 'Move in',
  fortify: 'Fortify',
  over: 'Game over',
};

/** Names by player id, with the neutral army named too. */
export function namer(players: ScreenPlayer[]) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (pid: string) =>
    pid === NEUTRAL ? 'the neutral army' : (byId.get(pid)?.name ?? 'Someone');
}

export const territoryName = (map: MapDef, t: string) =>
  map.territories.find((x) => x.id === t)?.name ?? t;

/** m:ss, for the turn clock. */
export const clock = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

/**
 * The turn clock, ticking in its own component: re-rendering the whole screen every second would
 * keep restarting a VerdictMoment's timer, so it would never clear itself.
 */
export function TurnClock({ at, now }: { at: number | null; now: () => number }) {
  const secs = useCountdown(at, now);
  return secs === null ? null : <span className="rk-turn__clock">{clock(secs)}</span>;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 26],
    [72, 26],
    [28, 50],
    [72, 50],
    [28, 74],
    [72, 74],
  ],
};

function Die({
  face,
  colour,
  lost,
  rolling,
  i,
}: {
  face: number;
  colour: string;
  lost: boolean;
  rolling: boolean;
  i: number;
}) {
  const cls = ['rk-die', rolling && 'is-rolling', !rolling && lost && 'is-lost']
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      viewBox="0 0 100 100"
      className={cls}
      style={{ animationDelay: `${i * 70}ms` }}
      role="img"
      aria-label={rolling ? 'Rolling' : `${face}${lost ? ', beaten' : ''}`}
    >
      <rect x="4" y="4" width="92" height="92" rx="14" style={{ fill: colour }} />
      {PIPS[face]!.map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r="9" className="rk-die__pip" />
      ))}
      {!rolling && lost && <path d="M14 86L86 14" className="rk-die__strike" />}
    </svg>
  );
}

const TUMBLE_MS = 720;

/**
 * True for a moment after a new battle arrives (not on first sight, so a refresh doesn't roll
 * again), with a tick that turns the faces while the dice tumble. Reduced motion skips it.
 */
function useTumble(seq: number | null): { rolling: boolean; tick: number } {
  const [seen, setSeen] = useState(seq);
  const [rolling, setRolling] = useState(false);
  const [tick, setTick] = useState(0);
  if (seq !== seen) {
    setSeen(seq);
    if (seq !== null) setRolling(true);
  }
  useEffect(() => {
    if (!rolling) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const turn = still ? null : setInterval(() => setTick((n) => n + 1), 90);
    const stop = setTimeout(() => setRolling(false), still ? 0 : TUMBLE_MS);
    return () => {
      if (turn) clearInterval(turn);
      clearTimeout(stop);
    };
  }, [rolling, seen]);
  return { rolling, tick };
}

/**
 * The last exchange of dice and what the attack cost each side: the dice tumble as a battle
 * lands, then settle with the beaten ones struck through.
 */
export function DiceStrip({
  battle,
  map,
  players,
  seats,
}: {
  battle: Battle | null;
  map: MapDef;
  players: ScreenPlayer[];
  seats: readonly string[];
}) {
  const { rolling, tick } = useTumble(battle?.seq ?? null);
  if (!battle) return null;
  const name = namer(players);
  const lost = beaten(battle.attackDice, battle.defendDice);
  // While tumbling, the faces turn over; they land on the real throw.
  const shown = (face: number, i: number) => (rolling ? ((face + tick * (i + 2)) % 6) + 1 : face);
  return (
    <div className={`rk-dice${rolling ? ' is-rolling' : ''}`} aria-live="polite">
      <span className="rk-dice__side">
        {battle.attackDice.map((f, i) => (
          <Die
            key={`${battle.seq}-a${i}`}
            i={i}
            face={shown(f, i)}
            colour={armyColour(battle.attacker, seats)}
            lost={lost.attack[i]!}
            rolling={rolling}
          />
        ))}
      </span>
      <span className="rk-dice__what">
        <span className="rk-dice__line">
          {territoryName(map, battle.from)} → {territoryName(map, battle.to)}
        </span>
        {rolling ? (
          <span className="rk-dice__line">{battle.mode === 'blitz' ? 'Blitz…' : 'Rolling…'}</span>
        ) : (
          <span className="rk-dice__line">
            {battle.mode === 'blitz' &&
              `Blitz, ${battle.throws} throw${battle.throws === 1 ? '' : 's'}: `}
            {name(battle.attacker)} −{battle.attackerLost} · {name(battle.defender)} −
            {battle.defenderLost}
            {battle.ended && (
              <OutcomeChip outcome={battle.conquered ? 'win' : 'loss'} className="rk-dice__chip">
                {battle.conquered ? 'Taken' : 'Held'}
              </OutcomeChip>
            )}
          </span>
        )}
      </span>
      <span className="rk-dice__side">
        {battle.defendDice.map((f, i) => (
          <Die
            key={`${battle.seq}-d${i}`}
            i={i + battle.attackDice.length}
            face={shown(f, i + 3)}
            colour={armyColour(battle.defender, seats)}
            lost={lost.defend[i]!}
            rolling={rolling}
          />
        ))}
      </span>
    </div>
  );
}

/**
 * Each continent, what it's worth and who holds all of it (their army colour in the swatch). In
 * fog of war a continent you can't see all of is "In the fog".
 */
export function Continents({
  map,
  t,
  players,
}: {
  map: MapDef;
  t: RiskTableView;
  players: ScreenPlayer[];
}) {
  const name = namer(players);
  const holders = [...t.seats, ...(t.neutral ? [NEUTRAL] : [])];
  return (
    <ul className="rk-continents">
      {map.continents.map((c) => {
        const holder = holders.find((p) => continentsHeld(map, t.owner, p).includes(c.id));
        const p = players.find((x) => x.id === holder);
        const unseen =
          t.fog && map.territories.some((x) => x.continent === c.id && !(x.id in t.owner));
        return (
          <li key={c.id} className="rk-continents__row">
            <span
              className="rk-continents__swatch"
              aria-hidden="true"
              style={holder ? { background: armyColour(holder, t.seats) } : undefined}
            />
            <span className="rk-continents__name">{c.name}</span>
            <span className="rk-continents__bonus">+{c.bonus}</span>
            <span className="rk-continents__holder">
              {p && <Token avatar={p.avatar} size={22} />}
              {holder ? name(holder) : unseen ? 'In the fog' : 'Nobody'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
