'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Token, type ScreenPlayer } from '@jackdaw/ui';
import {
  ArtArrow,
  ArtBag,
  ArtBars,
  ArtBulb,
  ArtCar,
  ArtChest,
  ArtCop,
  ArtHotel,
  ArtHouse,
  ArtRing,
  ArtTap,
  ArtTrain,
  ChanceMark,
} from './art';
import {
  BOARD,
  GO_TO_JAIL,
  JAIL,
  SPACES,
  deedAt,
  setOf,
  spaceName,
  type Group,
  type Names,
} from '../board';
import type { Holding, MonopolyTableView, MoveEvent } from '../rules';

/** Printed inks for the colour groups. The same by day and in the dark. */
export const GROUP_INK: Record<Group, string> = {
  brown: 'var(--mnp-brown)',
  sky: 'var(--mnp-sky)',
  pink: 'var(--mnp-pink)',
  orange: 'var(--mnp-orange)',
  red: 'var(--mnp-red)',
  yellow: 'var(--mnp-yellow)',
  green: 'var(--mnp-green)',
  navy: 'var(--mnp-navy)',
};

/** Long single words break where a printer would hyphenate them. */
const BREAKS: Record<string, string> = {
  Lamplighters: 'Lamp\u00adlighters',
  Fishmarket: 'Fish\u00admarket',
  Goldsmiths: 'Gold\u00adsmiths',
  Guildhall: 'Guild\u00adhall',
  Crowsfoot: 'Crows\u00adfoot',
  Kingsmead: 'Kings\u00admead',
  Mudlark: 'Mud\u00adlark',
  Weavers: 'Weav\u00aders',
  Coopers: 'Coop\u00aders',
  Tanners: 'Tan\u00adners',
  Cloister: 'Clois\u00adter',
  Quayside: 'Quay\u00adside',
  Terrace: 'Ter\u00adrace',
  Parade: 'Par\u00adade',
  Bishops: 'Bish\u00adops',
  Jackdaw: 'Jack\u00addaw',
  Conduit: 'Con\u00adduit',
  Mediterranean: 'Medi\u00adter\u00adranean',
  Connecticut: 'Con\u00adnecti\u00adcut',
  Pennsylvania: 'Penn\u00adsyl\u00advania',
  Community: 'Com\u00admunity',
  Carolina: 'Caro\u00adlina',
  Railroad: 'Rail\u00adroad',
  Tennessee: 'Tennes\u00adsee',
  Kentucky: 'Ken\u00adtucky',
  Illinois: 'Illi\u00adnois',
  Atlantic: 'Atlan\u00adtic',
  Virginia: 'Vir\u00adginia',
  Oriental: 'Orien\u00adtal',
  Electric: 'Elec\u00adtric',
  Company: 'Com\u00adpany',
  Boardwalk: 'Board\u00adwalk',
  Gardens: 'Gar\u00addens',
  Vermont: 'Ver\u00admont',
  Indiana: 'Indi\u00adana',
  Ventnor: 'Vent\u00adnor',
  Avenue: 'Ave\u00adnue',
  Pacific: 'Paci\u00adfic',
  Baltic: 'Bal\u00adtic',
};
export const printName = (name: string) =>
  name.replace(/[A-Za-z]+/g, (word) => BREAKS[word] ?? word);

/** The longest names, as printed on their space, where room is tight. */
const FACE: Record<string, string> = {
  'Mediterranean Avenue': 'Mediterranean',
  'Connecticut Avenue': 'Connecticut',
  'North Carolina Avenue': 'North Carolina',
  'Pennsylvania Avenue': 'Pennsylvania',
  'Pennsylvania Railroad': 'Penn. R.R.',
};

/** A name as printed on its space: Avenue and Railroad shortened, the longest cut to fit. */
export const faceName = (name: string) =>
  printName(FACE[name] ?? name.replace(/ Avenue$/, ' Ave.').replace(/ Railroad$/, ' R.R.'));

export const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export const tintOf = (p: ScreenPlayer | undefined) => `var(--tint-${p?.avatar.tint ?? 'slate'})`;

/** Grid row and column (1-based) of a space on the 11×11 board, GO at the bottom right. */
export function cellOf(space: number): { row: number; col: number; side: 'b' | 'l' | 't' | 'r' } {
  if (space <= 10) return { row: 11, col: 11 - space, side: 'b' };
  if (space <= 20) return { row: 11 - (space - 10), col: 1, side: 'l' };
  if (space <= 30) return { row: 1, col: 1 + (space - 20), side: 't' };
  return { row: 1 + (space - 30), col: 11, side: 'r' };
}

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Where each token is drawn. A token walks round the board one space at a time when it moves by
 * the dice, and jumps straight there when it's sent (to Jail, or by a card).
 */
export interface Walk {
  pos: Record<string, number>;
  /** Tokens whose last move was a jump, which fly rather than step. */
  jump: Record<string, boolean>;
  step: number;
}

export function useWalk(t: MonopolyTableView): Walk {
  const target = Object.fromEntries(t.players.map((id) => [id, t.seats[id]!.pos]));
  const [shown, setShown] = useState<Walk>({ pos: target, jump: {}, step: 0 });
  const plan = useRef<{ seq: number; moves: MoveEvent[] }>({ seq: t.seq, moves: [] });
  const key = t.players.map((id) => `${id}:${t.seats[id]!.pos}`).join(',');

  useEffect(() => {
    const settle = (prev: Walk): Walk => ({
      pos: { ...prev.pos, ...target },
      jump: {},
      step: prev.step + 1,
    });
    if (reduced()) {
      const now = window.setTimeout(() => setShown(settle), 0);
      return () => window.clearTimeout(now);
    }
    if (plan.current.seq !== t.seq) plan.current = { seq: t.seq, moves: t.moves.slice() };
    const queue = plan.current.moves;
    let timer = 0;
    // Play the moves of the last action in order, one space per beat, then settle the rest.
    const step = () => {
      let pause = STEP_MS;
      setShown((prev) => {
        const move = queue[0];
        if (!move) return settle(prev);
        const at = prev.pos[move.by] ?? move.from;
        if (move.jump || at === move.to) {
          queue.shift();
          pause = JUMP_MS;
          return {
            pos: { ...prev.pos, [move.by]: move.to },
            jump: { [move.by]: true },
            step: prev.step + 1,
          };
        }
        const next = (at + 1) % SPACES;
        if (next === move.to) queue.shift();
        return { pos: { ...prev.pos, [move.by]: next }, jump: {}, step: prev.step + 1 };
      });
      timer = window.setTimeout(queue.length ? step : () => setShown(settle), pause);
    };
    timer = window.setTimeout(step, 80);
    return () => window.clearTimeout(timer);
    // The key captures every position; target is rebuilt from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, t.seq]);

  return shown;
}

/** How long a token takes over one space, and over a jump. */
const STEP_MS = 210;
const JUMP_MS = 620;

interface BoardProps {
  t: MonopolyTableView;
  players: ScreenPlayer[];
  size: 'phone' | 'wide' | 'tv';
  /** Highlight this space (the one being bought or auctioned). */
  focus?: number | null;
  onSpace?: (space: number) => void;
  children?: ReactNode;
}

/** The board's tracks: two corner widths of 1.55 and nine spaces of 1, 12.1 in all. */
const EDGE = 1.55;
const TRACK = EDGE * 2 + 9;
const mid = (n: number) => {
  const start = n === 1 ? 0 : n <= 10 ? EDGE + (n - 2) : EDGE + 9;
  const width = n === 1 || n === 11 ? EDGE : 1;
  return ((start + width / 2) / TRACK) * 100;
};
/** Where tokens sharing a space stand, in fractions of a space. */
const HUDDLE: [number, number][] = [
  [0, 0],
  [-0.24, -0.2],
  [0.24, 0.2],
  [0.24, -0.2],
  [-0.24, 0.2],
  [0, 0.3],
];
const UNIT = 100 / TRACK;

/**
 * The printed board: forty spaces round a pale green centre. Owned deeds carry a stripe in the
 * owner's tint on their outer edge, buildings sit on the colour band, a mortgaged deed is
 * stamped. The tokens stand on a layer above, so they glide from space to space with a hop.
 * `children` fill the centre.
 */
export function Board({ t, players, size, focus = null, onSpace, children }: BoardProps) {
  const walk = useWalk(t);
  const byId = new Map(players.map((p) => [p.id, p]));
  const tokenSize = size === 'tv' ? 46 : size === 'wide' ? 28 : 16;

  return (
    <div className={`mnp-board mnp-board--${size}`}>
      {BOARD.map((sp, i) => {
        const { row, col, side } = cellOf(i);
        const deed = deedAt(i);
        const h: Holding | undefined = t.deeds[String(i)];
        const owner = h ? byId.get(h.owner) : undefined;
        const corner = i % 10 === 0;
        const fullSet =
          deed?.kind === 'street' &&
          !!h &&
          setOf(i).every((d) => t.deeds[String(d)]?.owner === h.owner);
        const style = {
          gridRow: row,
          gridColumn: col,
          '--band': deed?.kind === 'street' ? GROUP_INK[deed.group] : undefined,
          '--owner': owner ? tintOf(owner) : undefined,
        } as CSSProperties;
        const label = `${spaceName(i, t.names)}${deed ? `, ${money(deed.price)}` : ''}${owner ? `, owned by ${owner.name}` : ''}${h?.mortgaged ? ', mortgaged' : ''}`;
        const Tag = onSpace ? 'button' : 'div';
        return (
          <Tag
            key={i}
            type={onSpace ? 'button' : undefined}
            className={`mnp-sp mnp-sp--${side} mnp-sp--${sp.kind}${corner ? ' mnp-sp--corner' : ''}${focus === i ? ' is-focus' : ''}${h?.mortgaged ? ' is-mortgaged' : ''}${owner ? ' is-owned' : ''}${fullSet ? ' is-set' : ''}`}
            style={style}
            onClick={onSpace ? () => onSpace(i) : undefined}
            aria-label={onSpace ? label : undefined}
            title={size === 'phone' ? undefined : label}
          >
            {deed?.kind === 'street' && (
              <span className="mnp-sp__band">
                <Buildings houses={h?.houses ?? 0} />
              </span>
            )}
            {size !== 'phone' ? <SpaceFace space={i} names={t.names} /> : <PhoneGlyph space={i} />}
            {owner && <span className="mnp-sp__owner" aria-hidden="true" />}
            {h?.mortgaged && <span className="mnp-sp__m">M</span>}
          </Tag>
        );
      })}
      <div className="mnp-centre">{children}</div>
      <div className="mnp-tokens" aria-hidden="true">
        {t.players.map((id) => {
          const s = t.seats[id]!;
          if (s.out) return null;
          const pos = walk.pos[id] ?? s.pos;
          const { row, col } = cellOf(pos);
          const jailed = pos === JAIL && s.jailed;
          const mates = t.players.filter(
            (o) =>
              !t.seats[o]!.out &&
              (walk.pos[o] ?? t.seats[o]!.pos) === pos &&
              (pos !== JAIL || t.seats[o]!.jailed === s.jailed),
          );
          const k = mates.indexOf(id);
          const [hx, hy] = mates.length > 1 ? HUDDLE[k % HUDDLE.length]! : [0, 0];
          // In Jail the cell is the inner corner; visitors stand on the outer edge.
          const jx = pos === JAIL ? (jailed ? 0.3 : -0.35) : 0;
          const jy = pos === JAIL ? (jailed ? -0.3 : 0.35) : 0;
          const p = byId.get(id);
          return (
            <span
              key={id}
              className={`mnp-token${walk.jump[id] ? ' is-jump' : ''}${t.turn === id ? ' is-turn' : ''}`}
              style={
                {
                  left: `${mid(col) + (hx + jx) * UNIT}%`,
                  top: `${mid(row) + (hy + jy) * UNIT}%`,
                  '--tok': `${tokenSize}px`,
                } as CSSProperties
              }
            >
              <span key={`${pos}-${walk.step}`} className="mnp-token__hop">
                {p && <Token avatar={p.avatar} size={tokenSize} title={p.name} />}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Buildings({ houses }: { houses: number }) {
  if (!houses) return null;
  if (houses === 5) {
    return (
      <span className="mnp-built mnp-built--hotel" aria-label="Hotel">
        <ArtHotel />
      </span>
    );
  }
  return (
    <span className="mnp-built" aria-label={`${houses} ${houses === 1 ? 'house' : 'houses'}`}>
      {Array.from({ length: houses }, (_, k) => (
        <ArtHouse key={k} />
      ))}
    </span>
  );
}

/** A special space's drawing. */
function SpaceArt({ space }: { space: number }) {
  const sp = BOARD[space]!;
  switch (sp.kind) {
    case 'chance':
      return <ChanceMark space={space} />;
    case 'chest':
      return <ArtChest />;
    case 'railroad':
      return <ArtTrain />;
    case 'utility':
      return space === 12 ? <ArtBulb /> : <ArtTap />;
    case 'tax':
      return space === 4 ? <ArtBag /> : <ArtRing />;
    case 'parking':
      return <ArtCar />;
    case 'gotojail':
      return <ArtCop />;
    case 'jail':
      return <ArtBars />;
    case 'go':
      return <ArtArrow />;
    default:
      return null;
  }
}

/** The printed face of a space on a laptop or TV board. */
function SpaceFace({ space, names }: { space: number; names: Names }) {
  const sp = BOARD[space]!;
  const deed = deedAt(space);
  if (sp.kind === 'go') {
    return (
      <span className="mnp-face mnp-face--go">
        <span className="mnp-face__small">Collect $200</span>
        <span className="mnp-face__big">GO</span>
        <span className="mnp-face__arrow">
          <ArtArrow />
        </span>
      </span>
    );
  }
  if (sp.kind === 'jail') {
    return (
      <span className="mnp-face mnp-face--jail">
        <span className="mnp-face__cell">
          <ArtBars />
          <span className="mnp-face__in">In jail</span>
        </span>
        <span className="mnp-face__just">Just</span>
        <span className="mnp-face__visiting">Visiting</span>
      </span>
    );
  }
  if (sp.kind === 'parking' || sp.kind === 'gotojail') {
    const [a, b] = sp.kind === 'parking' ? ['Free', 'Parking'] : ['Go to', 'Jail'];
    return (
      <span className={`mnp-face mnp-face--${sp.kind}`}>
        <span className="mnp-face__name">{a}</span>
        <span className="mnp-face__glyph">
          <SpaceArt space={space} />
        </span>
        <span className="mnp-face__name">{b}</span>
      </span>
    );
  }
  const drawn = sp.kind !== 'street';
  return (
    <span className={`mnp-face${drawn ? ' mnp-face--drawn' : ''}`}>
      <span className="mnp-face__name">
        {sp.kind === 'chest' ? printName('Community Chest') : faceName(spaceName(space, names))}
      </span>
      {drawn && (
        <span className="mnp-face__glyph">
          <SpaceArt space={space} />
        </span>
      )}
      {deed && <span className="mnp-face__price">{money(deed.price)}</span>}
      {sp.kind === 'tax' && <span className="mnp-face__price">Pay {money(sp.amount)}</span>}
    </span>
  );
}

/** On a phone the spaces are too small for names; the drawings tell the specials apart. */
function PhoneGlyph({ space }: { space: number }) {
  const sp = BOARD[space]!;
  if (sp.kind === 'street') return null;
  if (sp.kind === 'go') return <span className="mnp-glyph mnp-glyph--go">GO</span>;
  return (
    <span className="mnp-glyph">
      <SpaceArt space={space} />
    </span>
  );
}

/** Two printed dice. They tumble whenever a new throw lands. */
export function Dice({
  dice,
  rolls,
  size,
}: {
  dice: [number, number] | null;
  rolls: number;
  size: number;
}) {
  if (!dice) return null;
  return (
    <span
      className="mnp-dice"
      style={{ '--die': `${size}px` } as CSSProperties}
      aria-label={`Rolled ${dice[0]} and ${dice[1]}`}
    >
      {dice.map((n, k) => (
        <span key={`${rolls}-${k}`} className={`mnp-die mnp-die--${k}`}>
          {PIPS[n]!.map((p) => (
            <span key={p} className={`mnp-pip mnp-pip--${p}`} />
          ))}
        </span>
      ))}
    </span>
  );
}

const PIPS: Record<number, string[]> = {
  1: ['c'],
  2: ['tl', 'br'],
  3: ['tl', 'c', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'c', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

/** A drawn Chance or Community Chest card, flying out of its pile when it's new. */
export function DrawnCard({
  card,
  fresh,
  by,
}: {
  card: NonNullable<MonopolyTableView['card']>;
  fresh: boolean;
  by?: string;
}) {
  return (
    <div className={`mnp-card mnp-card--${card.deck}${fresh ? ' is-fresh' : ''}`} role="status">
      <span className="mnp-card__head">
        <span className="mnp-card__emblem">
          {card.deck === 'chance' ? <span className="mnp-q mnp-q--cream">?</span> : <ArtChest />}
        </span>
        {card.deck === 'chance' ? 'Chance' : 'Community Chest'}
      </span>
      <span className="mnp-card__text">{card.text}</span>
      {by && <span className="mnp-card__by">Drawn by {by}</span>}
    </div>
  );
}

export { GO_TO_JAIL };
