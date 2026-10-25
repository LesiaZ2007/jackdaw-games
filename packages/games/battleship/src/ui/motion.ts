'use client';

import { useEffect, useState } from 'react';
import { cellName, shipOf } from '../fleet';
import type { Volley } from '../rules';

const reduce = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The seq of a volley that arrived after this screen opened, for one flight of the pegs.
 * A refresh does not replay it. Reduced motion skips the flight.
 */
export function useArrival(seq: number): number | null {
  const [tracked, setTracked] = useState(seq);
  const [arrived, setArrived] = useState<number | null>(null);
  if (tracked !== seq) {
    setTracked(seq);
    setArrived(reduce() ? null : seq);
  }
  useEffect(() => {
    if (arrived == null) return;
    const t = window.setTimeout(() => setArrived(null), 1700);
    return () => window.clearTimeout(t);
  }, [arrived]);
  return arrived;
}

export interface Felt {
  outcome: 'win' | 'loss' | 'reveal';
  title: string;
  detail: string;
}

/** What this player can feel from a public volley: a hit, a ship sunk, or one of theirs lost. */
export function feltMoment(last: Volley | null, me: string | null): Felt | null {
  if (!last || me == null) return null;
  const mine = last.at === me;
  const sunkLine = (whose: 'Your' | 'Their') => {
    const names = last.sunk.map((w) => shipOf(w.id).name.toLowerCase());
    const ship =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `${whose} ${ship} ${names.length === 1 ? 'is' : 'are'} ${whose === 'Your' ? 'sunk' : 'down'}.`;
  };
  if (last.sunk.length && mine)
    return { outcome: 'loss', title: 'Ship lost', detail: sunkLine('Your') };
  if (last.sunk.length && last.by === me)
    return { outcome: 'win', title: 'Sunk', detail: sunkLine('Their') };
  const hits = last.shots
    .filter((shot) => shot.result === 'hit')
    .map((shot) => cellName(shot.cell));
  if (hits.length && last.by === me)
    return { outcome: 'reveal', title: 'Hit', detail: hits.join(', ') };
  if (hits.length && mine) return { outcome: 'loss', title: 'Hit', detail: 'They hit your fleet.' };
  return null;
}

/** The same moment for the TV, which is nobody's seat: hit or sunk, never a hidden ship. */
export function tableMoment(last: Volley | null): Felt | null {
  if (!last) return null;
  if (last.sunk.length) {
    const ships = last.sunk.map((w) => shipOf(w.id).name).join(' and ');
    return { outcome: 'reveal', title: 'Sunk', detail: ships };
  }
  const hits = last.shots.filter((shot) => shot.result === 'hit');
  if (hits.length) {
    return {
      outcome: 'reveal',
      title: 'Hit',
      detail: hits.map((shot) => cellName(shot.cell)).join(', '),
    };
  }
  return null;
}

/**
 * Shows `moment` shortly after `seq` moves on, so the peg can land first. Pass null for a miss.
 * A refresh does not replay the volley already on screen.
 */
export function useDelayedFelt(seq: number, moment: Felt | null): [Felt | null, () => void] {
  const [tracked, setTracked] = useState(seq);
  const [show, setShow] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  if (tracked !== seq) {
    setTracked(seq);
    setShow(null);
    setPending(moment ? seq : null);
  }
  useEffect(() => {
    if (pending == null) return;
    const t = window.setTimeout(() => setShow(pending), reduce() ? 0 : 900);
    return () => window.clearTimeout(t);
  }, [pending]);
  return [show === seq && moment ? moment : null, () => setShow(null)];
}
