'use client';

import { Token, useCountdown, type ScreenPlayer } from '@jackdaw/ui';
import type { CSSProperties } from 'react';
import type { CatanTableView, Phase } from '../rules';
import type { DevCard } from '../types';
import { DevGlyph } from './glyphs';
import { seatColour } from './palette';

export const namer =
  (players: { id: string; name: string }[]) =>
  (id: string | null | undefined): string =>
    players.find((p) => p.id === id)?.name ?? 'Someone';

/** A log line with `{actor}` and `{playerId}` written out as names. */
export const logLine = (
  e: { text: string; actor?: string },
  name: (id: string | null | undefined) => string,
): string => e.text.replace(/\{([^}]+)\}/g, (_, id: string) => name(id === 'actor' ? e.actor : id));

export const PHASE_LABEL: Record<Phase, string> = {
  setup: 'Opening placements',
  roll: 'Rolling',
  discard: 'Discarding',
  robber: 'Moving the robber',
  main: 'Trading and building',
  roadBuilding: 'Free roads',
  over: 'Game over',
};

export const DEV_NAME: Record<DevCard, string> = {
  knight: 'Knight',
  roadBuilding: 'Road building',
  yearOfPlenty: 'Year of plenty',
  monopoly: 'Monopoly',
  victoryPoint: 'Victory point',
};

export const DEV_TEXT: Record<DevCard, string> = {
  knight: 'Move the robber and take a card. Three or more make the Largest Army.',
  roadBuilding: 'Build two roads for free.',
  yearOfPlenty: 'Take any two cards from the bank.',
  monopoly: 'Name a resource. Everyone gives you all of theirs.',
  victoryPoint: 'Worth a point. Kept hidden; it counts by itself.',
};

const PIPS: Record<number, number[]> = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

/** A die: cream with ink pips, or gules with cream pips (Catan's two colours of dice). */
export function Die({ n, red }: { n: number; red?: boolean }) {
  return (
    <span className={red ? 'ctn-die ctn-die--red' : 'ctn-die'} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={PIPS[n]!.includes(i + 1) ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

export function Dice({ dice, seq }: { dice: [number, number] | null; seq: number }) {
  if (!dice) return null;
  return (
    <span className="ctn-dice" key={seq} aria-label={`Rolled ${dice[0] + dice[1]}`} role="img">
      <Die n={dice[0]} />
      <Die n={dice[1]} red />
    </span>
  );
}

export function Clock({ at, now }: { at: number | null; now: () => number }) {
  const left = useCountdown(at, now);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const s = `${left % 60}`.padStart(2, '0');
  return (
    <span
      className={left <= 10 ? 'ctn-clock ctn-clock--late' : 'ctn-clock'}
      aria-label={`${left} seconds left`}
    >
      {m}:{s}
    </span>
  );
}

/** A player's token ringed in their piece colour. */
export function SeatToken({
  p,
  seats,
  size,
}: {
  p: ScreenPlayer | undefined;
  seats: readonly string[];
  size: number;
}) {
  if (!p) return null;
  return (
    <span className="ctn-seattok" style={{ '--ctn-own': seatColour(p.id, seats) } as CSSProperties}>
      <Token avatar={p.avatar} size={size} away={!p.online} />
    </span>
  );
}

/** Award marks beside a name: the road and the army, with what earns them. */
export function Awards({ t, id }: { t: CatanTableView; id: string }) {
  return (
    <>
      {t.longest.holder === id && (
        <span className="ctn-award-mark" title="Longest Road">
          <DevGlyph kind="longroad" />
          <span className="ctn-sr">Longest Road</span>
        </span>
      )}
      {t.army === id && (
        <span className="ctn-award-mark" title="Largest Army">
          <DevGlyph kind="army" />
          <span className="ctn-sr">Largest Army</span>
        </span>
      )}
    </>
  );
}
