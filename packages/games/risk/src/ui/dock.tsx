'use client';

import { Plaque } from '@jackdaw/ui';
import { useState, type ReactNode } from 'react';
import type { MapDef } from '../maps';
import type { RiskAction, RiskTableView } from '../rules';
import { territoryName } from './common';

type Send = (a: RiskAction) => Promise<boolean>;

function Dock({
  title,
  children,
  hint,
}: {
  title: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rk-dock" aria-label={title}>
      <p className="rk-dock__title">{title}</p>
      {hint && <p className="rk-dock__hint">{hint}</p>}
      {children && <div className="rk-dock__actions">{children}</div>}
    </section>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <span className="rk-stepper" role="group" aria-label={label}>
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        aria-label="Fewer"
      >
        −
      </button>
      <output>{value}</output>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="More"
      >
        +
      </button>
    </span>
  );
}

/** Reinforce or draft: tap your territories to stage armies, then send them all at once. */
export function PlaceDock({
  total,
  staged,
  onUndo,
  onDone,
  busy,
  mustTrade,
  canTrade,
  onCards,
  draft,
}: {
  total: number;
  staged: string[];
  onUndo: () => void;
  onDone: () => void;
  busy: boolean;
  mustTrade: boolean;
  canTrade: boolean;
  onCards: () => void;
  draft?: boolean;
}) {
  const left = total - staged.length;
  if (mustTrade)
    return (
      <Dock title="Trade first" hint="You hold five or more cards, so trade a set before placing.">
        <Plaque go onClick={onCards}>
          Your cards
        </Plaque>
      </Dock>
    );
  return (
    <Dock
      title={left > 0 ? `Place ${left} ${left === 1 ? 'army' : 'armies'}` : 'All placed'}
      hint={
        left > 0
          ? `Tap your territories to add one at a time${draft ? '. Nobody sees them until everyone’s done.' : '.'}`
          : draft
            ? 'Send them when you’re happy. They’re hidden until everyone’s done.'
            : 'Send them, then attack.'
      }
    >
      {canTrade && (
        <Plaque small onClick={onCards}>
          Trade cards
        </Plaque>
      )}
      <Plaque small disabled={!staged.length || busy} onClick={onUndo}>
        Undo
      </Plaque>
      <Plaque go disabled={left > 0 || busy} onClick={onDone}>
        {draft ? 'Done' : 'Place them'}
      </Plaque>
    </Dock>
  );
}

/** Attack: pick a territory to attack from, then a neighbour, then Roll or Blitz. */
export function AttackDock({
  t,
  map,
  from,
  to,
  busy,
  send,
  onCancel,
}: {
  t: RiskTableView;
  map: MapDef;
  from: string | null;
  to: string | null;
  busy: boolean;
  send: Send;
  onCancel: () => void;
}) {
  const name = (id: string) => `${territoryName(map, id)} (${t.armies[id]})`;
  const ends = (
    <>
      <Plaque small disabled={busy} onClick={() => send({ type: 'endAttack' })}>
        Stop attacking
      </Plaque>
    </>
  );
  if (from && to)
    return (
      <Dock
        title={`${name(from)} → ${name(to)}`}
        hint="Roll for one throw of the dice, or Blitz to fight it out."
      >
        <Plaque small disabled={busy} onClick={onCancel}>
          Back
        </Plaque>
        <Plaque disabled={busy} onClick={() => send({ type: 'attack', from, to, mode: 'blitz' })}>
          Blitz
        </Plaque>
        <Plaque go disabled={busy} onClick={() => send({ type: 'attack', from, to, mode: 'roll' })}>
          Roll
        </Plaque>
      </Dock>
    );
  if (from)
    return (
      <Dock title={`Attack from ${name(from)}`} hint="Tap an enemy neighbour (outlined).">
        <Plaque small disabled={busy} onClick={onCancel}>
          Back
        </Plaque>
        {ends}
      </Dock>
    );
  return (
    <Dock title="Attack" hint="Tap one of your territories with 2 or more armies to attack from.">
      {ends}
    </Dock>
  );
}

/** After a conquest: how many armies march in. */
export function OccupyDock({
  t,
  map,
  busy,
  send,
}: {
  t: RiskTableView;
  map: MapDef;
  busy: boolean;
  send: Send;
}) {
  const o = t.occupy!;
  const [n, setN] = useState(o.max);
  return (
    <Dock
      title={`Move into ${territoryName(map, o.to)}`}
      hint={
        o.min === o.max
          ? undefined
          : `At least ${o.min}; at least 1 stays in ${territoryName(map, o.from)}.`
      }
    >
      {o.min < o.max && (
        <Stepper value={n} min={o.min} max={o.max} onChange={setN} label="Armies to move" />
      )}
      <Plaque go disabled={busy} onClick={() => send({ type: 'occupy', n })}>
        Move {n}
      </Plaque>
    </Dock>
  );
}

/** Fortify: one move between your own joined-up territories, then the turn ends. */
export function FortifyDock({
  t,
  map,
  from,
  to,
  n,
  setN,
  busy,
  send,
  onCancel,
}: {
  t: RiskTableView;
  map: MapDef;
  from: string | null;
  to: string | null;
  n: number;
  setN: (n: number) => void;
  busy: boolean;
  send: Send;
  onCancel: () => void;
}) {
  const end = (
    <Plaque small disabled={busy} onClick={() => send({ type: 'endTurn' })}>
      End turn
    </Plaque>
  );
  if (from && to)
    return (
      <Dock title={`${territoryName(map, from)} → ${territoryName(map, to)}`}>
        <Plaque small disabled={busy} onClick={onCancel}>
          Back
        </Plaque>
        <Stepper
          value={n}
          min={1}
          max={t.armies[from]! - 1}
          onChange={setN}
          label="Armies to move"
        />
        <Plaque go disabled={busy} onClick={() => send({ type: 'fortify', from, to, n })}>
          Move {n}
        </Plaque>
      </Dock>
    );
  return (
    <Dock
      title="Fortify"
      hint={
        from
          ? 'Tap where they should go (outlined).'
          : 'Move armies once between your joined-up territories, or end your turn.'
      }
    >
      {from && (
        <Plaque small disabled={busy} onClick={onCancel}>
          Back
        </Plaque>
      )}
      {end}
    </Dock>
  );
}

export function WaitDock({ title, hint }: { title: string; hint?: string }) {
  return <Dock title={title} hint={hint} />;
}
