'use client';

import { OutcomeChip, Token, type ScreenPlayer } from '@jackdaw/ui';
import { NEUTRAL, continentsHeld } from '../board';
import type { MapDef } from '../maps';
import type { Battle, Phase, RiskTableView } from '../rules';
import { tintOf } from './map';

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

function Die({ face, pid, players }: { face: number; pid: string; players: ScreenPlayer[] }) {
  const pips: Record<number, [number, number][]> = {
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
  return (
    <svg viewBox="0 0 100 100" className="rk-die" role="img" aria-label={String(face)}>
      <rect x="4" y="4" width="92" height="92" rx="14" style={{ fill: tintOf(pid, players) }} />
      {pips[face]!.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" className="rk-die__pip" />
      ))}
    </svg>
  );
}

/** The last exchange of dice and what the attack cost each side. */
export function DiceStrip({
  battle,
  map,
  players,
}: {
  battle: Battle | null;
  map: MapDef;
  players: ScreenPlayer[];
}) {
  if (!battle) return null;
  const name = namer(players);
  return (
    <div className="rk-dice" aria-live="polite">
      <span className="rk-dice__side">
        {battle.attackDice.map((f, i) => (
          <Die key={i} face={f} pid={battle.attacker} players={players} />
        ))}
      </span>
      <span className="rk-dice__what">
        <span className="rk-dice__line">
          {territoryName(map, battle.from)} → {territoryName(map, battle.to)}
          {battle.mode === 'blitz' && ' (blitz)'}
        </span>
        <span className="rk-dice__line">
          {name(battle.attacker)} −{battle.attackerLost} · {name(battle.defender)} −
          {battle.defenderLost}
          {battle.ended && (
            <OutcomeChip outcome={battle.conquered ? 'win' : 'loss'} className="rk-dice__chip">
              {battle.conquered ? 'Taken' : 'Held'}
            </OutcomeChip>
          )}
        </span>
      </span>
      <span className="rk-dice__side">
        {battle.defendDice.map((f, i) => (
          <Die key={i} face={f} pid={battle.defender} players={players} />
        ))}
      </span>
    </div>
  );
}

/** Each continent, what it's worth and who holds all of it. */
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
        return (
          <li key={c.id} className={`rk-continents__row rk-wash--${c.tint}`}>
            <span className="rk-continents__swatch" aria-hidden="true" />
            <span className="rk-continents__name">{c.name}</span>
            <span className="rk-continents__bonus">+{c.bonus}</span>
            <span className="rk-continents__holder">
              {p && <Token avatar={p.avatar} size={22} />}
              {holder ? name(holder) : 'Nobody'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
