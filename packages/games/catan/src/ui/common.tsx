'use client';

import { Token, useCountdown, type ScreenPlayer } from '@jackdaw/ui';
import type { EventFace } from '../ck';
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
  pick: 'Choosing',
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

/** A die: cream with ink pips, or gules with cream pips (Catan's two colors of dice). */
export function Die({ n, red }: { n: number; red?: boolean }) {
  return (
    <span className={red ? 'ctn-die ctn-die--red' : 'ctn-die'} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={PIPS[n]!.includes(i + 1) ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

/** Cities & Knights' event die: the barbarian ship, or a city gate in a track's color. */
export function EventDie({ face }: { face: EventFace }) {
  return (
    <span
      className={
        face === 'ship' ? 'ctn-die ctn-die--event' : `ctn-die ctn-die--event ctn-fill--${face}`
      }
      aria-hidden="true"
    >
      <svg viewBox="-12 -12 24 24">
        {face === 'ship' ? (
          <>
            <path d="M-9 2H9L6 7H-6z" className="ctn-evt__ink" />
            <path d="M-.6 2V-9" className="ctn-evt__line" />
            <path d="M.6 -8.5 7 0H.6z" className="ctn-evt__ink" />
          </>
        ) : (
          <path d="M-7 8V-2A7 7 0 0 1 7 -2V8H3V0A3 3 0 0 0 -3 0V8z" className="ctn-evt__gate" />
        )}
      </svg>
    </span>
  );
}

export function Dice({
  dice,
  seq,
  waiting = false,
  event = null,
}: {
  dice: [number, number] | null;
  seq: number;
  /** Hidden while the big roll is gliding up to take their place. */
  waiting?: boolean;
  /** Cities & Knights: the event die, and the first die is the red one. */
  event?: EventFace | null;
}) {
  if (!dice) return null;
  return (
    <span
      className={['ctn-dice', waiting && 'ctn-dice--waiting', event && 'ctn-dice--three']
        .filter(Boolean)
        .join(' ')}
      key={seq}
      aria-label={`Rolled ${dice[0] + dice[1]}`}
      role="img"
    >
      <Die n={dice[0]} red={!!event} />
      <Die n={dice[1]} red={!event} />
      {event && <EventDie face={event} />}
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

/** A player's token ringed in their piece color. */
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
