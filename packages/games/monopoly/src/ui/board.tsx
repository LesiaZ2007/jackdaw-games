'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Token, type ScreenPlayer } from '@jackdaw/ui';
import {
  BOARD,
  GO_TO_JAIL,
  JAIL,
  SPACES,
  deedAt,
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
export function useWalk(t: MonopolyTableView): Record<string, number> {
  const target = Object.fromEntries(t.players.map((id) => [id, t.seats[id]!.pos]));
  const [shown, setShown] = useState(target);
  const plan = useRef<{ seq: number; moves: MoveEvent[] }>({ seq: t.seq, moves: [] });
  const key = t.players.map((id) => `${id}:${t.seats[id]!.pos}`).join(',');

  useEffect(() => {
    if (reduced()) {
      const now = window.setTimeout(() => setShown(target), 0);
      return () => window.clearTimeout(now);
    }
    if (plan.current.seq !== t.seq) plan.current = { seq: t.seq, moves: t.moves.slice() };
    const queue = plan.current.moves;
    let timer = 0;
    // Play the moves of the last action in order, then settle anything left on its target.
    const step = () => {
      setShown((prev) => {
        const move = queue[0];
        if (!move) {
          const done = { ...prev };
          for (const id of Object.keys(target)) done[id] = target[id]!;
          return done;
        }
        const at = prev[move.by] ?? move.from;
        if (move.jump || at === move.to) {
          queue.shift();
          return { ...prev, [move.by]: move.to };
        }
        const next = (at + 1) % SPACES;
        if (next === move.to) queue.shift();
        return { ...prev, [move.by]: next };
      });
      if (queue.length) timer = window.setTimeout(step, 150);
      else timer = window.setTimeout(() => setShown(target), 150);
    };
    timer = window.setTimeout(step, 60);
    return () => window.clearTimeout(timer);
    // The key captures every position; target is rebuilt from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, t.seq]);

  return shown;
}

interface BoardProps {
  t: MonopolyTableView;
  players: ScreenPlayer[];
  size: 'phone' | 'wide' | 'tv';
  /** Highlight this space (the one being bought or auctioned). */
  focus?: number | null;
  onSpace?: (space: number) => void;
  children?: ReactNode;
}

/**
 * The printed board: forty spaces round a pale green centre. Owned deeds carry a stripe in the
 * owner's tint on their outer edge, buildings sit on the colour band, a mortgaged deed is
 * hatched, and the tokens stand on their spaces. `children` fill the centre.
 */
export function Board({ t, players, size, focus = null, onSpace, children }: BoardProps) {
  const shown = useWalk(t);
  const byId = new Map(players.map((p) => [p.id, p]));
  const tokenSize = size === 'tv' ? 44 : size === 'wide' ? 26 : 15;
  const here = (space: number) =>
    t.players.filter((id) => !t.seats[id]!.out && shown[id] === space);

  return (
    <div className={`mnp-board mnp-board--${size}`}>
      {BOARD.map((sp, i) => {
        const { row, col, side } = cellOf(i);
        const deed = deedAt(i);
        const h: Holding | undefined = t.deeds[String(i)];
        const owner = h ? byId.get(h.owner) : undefined;
        const corner = i % 10 === 0;
        const tokens = here(i);
        const jailed = i === JAIL ? tokens.filter((id) => t.seats[id]!.jailed) : [];
        const visiting = i === JAIL ? tokens.filter((id) => !t.seats[id]!.jailed) : tokens;
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
            className={`mnp-sp mnp-sp--${side} mnp-sp--${sp.kind}${corner ? ' mnp-sp--corner' : ''}${focus === i ? ' is-focus' : ''}${h?.mortgaged ? ' is-mortgaged' : ''}${owner ? ' is-owned' : ''}`}
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
            {size !== 'phone' && <SpaceFace space={i} names={t.names} />}
            {size === 'phone' && <PhoneGlyph space={i} />}
            {owner && <span className="mnp-sp__owner" aria-hidden="true" />}
            {h?.mortgaged && <span className="mnp-sp__m">M</span>}
            {jailed.length > 0 && (
              <span className="mnp-sp__cell" aria-label="In jail">
                {jailed.map((id) => (
                  <Piece key={id} p={byId.get(id)} size={tokenSize} turn={t.turn === id} />
                ))}
              </span>
            )}
            {visiting.length > 0 && (
              <span className="mnp-sp__tokens">
                {visiting.map((id) => (
                  <Piece key={id} p={byId.get(id)} size={tokenSize} turn={t.turn === id} />
                ))}
              </span>
            )}
          </Tag>
        );
      })}
      <div className="mnp-centre">{children}</div>
    </div>
  );
}

function Piece({ p, size, turn }: { p: ScreenPlayer | undefined; size: number; turn: boolean }) {
  if (!p) return null;
  return (
    <span className={`mnp-piece${turn ? ' is-turn' : ''}`}>
      <Token avatar={p.avatar} size={size} title={p.name} />
    </span>
  );
}

function Buildings({ houses }: { houses: number }) {
  if (!houses) return null;
  if (houses === 5) return <span className="mnp-hotel" aria-label="Hotel" />;
  return (
    <span className="mnp-houses" aria-label={`${houses} ${houses === 1 ? 'house' : 'houses'}`}>
      {Array.from({ length: houses }, (_, k) => (
        <span key={k} className="mnp-house" />
      ))}
    </span>
  );
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
        <Arrow />
      </span>
    );
  }
  if (sp.kind === 'jail') {
    return (
      <span className="mnp-face mnp-face--jail">
        <span className="mnp-face__small">Just visiting</span>
        <span className="mnp-face__bars" aria-hidden="true">
          <Bars />
        </span>
      </span>
    );
  }
  if (sp.kind === 'parking' || sp.kind === 'gotojail') {
    return (
      <span className={`mnp-face mnp-face--${sp.kind}`}>
        <span className="mnp-face__glyph" aria-hidden="true">
          {sp.kind === 'parking' ? <Cart /> : <Gavel />}
        </span>
        <span className="mnp-face__name">{sp.name}</span>
      </span>
    );
  }
  return (
    <span className="mnp-face">
      <span className="mnp-face__name">{faceName(spaceName(space, names))}</span>
      {(sp.kind === 'chance' ||
        sp.kind === 'chest' ||
        sp.kind === 'railroad' ||
        sp.kind === 'utility') && (
        <span className="mnp-face__glyph" aria-hidden="true">
          <KindGlyph kind={sp.kind} space={space} />
        </span>
      )}
      {deed && <span className="mnp-face__price">{money(deed.price)}</span>}
      {sp.kind === 'tax' && <span className="mnp-face__price">Pay {money(sp.amount)}</span>}
    </span>
  );
}

/** On a phone the spaces are too small for names; a glyph tells the specials apart. */
function PhoneGlyph({ space }: { space: number }) {
  const sp = BOARD[space]!;
  if (sp.kind === 'street') return null;
  if (sp.kind === 'go') return <span className="mnp-glyph mnp-glyph--go">GO</span>;
  if (sp.kind === 'tax') return <span className="mnp-glyph">$</span>;
  if (sp.kind === 'jail' || sp.kind === 'parking' || sp.kind === 'gotojail') {
    return (
      <span className="mnp-glyph" aria-hidden="true">
        {sp.kind === 'jail' ? <Bars /> : sp.kind === 'parking' ? <Cart /> : <Gavel />}
      </span>
    );
  }
  return (
    <span className="mnp-glyph" aria-hidden="true">
      <KindGlyph kind={sp.kind} space={space} />
    </span>
  );
}

function KindGlyph({ kind, space }: { kind: string; space: number }) {
  if (kind === 'chance') return <span className="mnp-q">?</span>;
  if (kind === 'chest') return <Chest />;
  if (kind === 'railroad') return <Train />;
  return space === 12 ? <Bulb /> : <Tap />;
}

/* Small engraved glyphs, drawn in ink on a 24 box. */
const svg = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    {children}
  </svg>
);
const Arrow = () => (
  <span className="mnp-face__arrow" aria-hidden="true">
    {svg(<path d="M21 12H4m6-6-6 6 6 6" />)}
  </span>
);
const Bars = () => svg(<path d="M4 4h16v16H4zM8 4v16M12 4v16M16 4v16" />);
const Cart = () =>
  svg(<path d="M3 15h13l3-6H6M7 19a1.5 1.5 0 1 0 0 .1M16 19a1.5 1.5 0 1 0 0 .1M3 15 2 6" />);
const Gavel = () => svg(<path d="m13 4 7 7m-9-5 7 7m-8.5-3.5L4 15l3 3 5.5-5.5M3 21h9" />);
const Chest = () => svg(<path d="M3 10h18v10H3zM3 10a9 5 0 0 1 18 0M10 13h4v3h-4z" />);
const Train = () =>
  svg(
    <path d="M7 3h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 10h14M9 14h.01M15 14h.01M8 17l-2 4M16 17l2 4" />,
  );
const Bulb = () =>
  svg(
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />,
  );
const Tap = () =>
  svg(
    <path d="M4 9h9a4 4 0 0 1 4 4v1M8 9V6h3v3M17 17v.5M15.5 20a1.5 1.5 0 0 0 3 0c0-1-1.5-2.5-1.5-2.5S15.5 19 15.5 20z" />,
  );

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

/** A drawn Chance or Community Chest card. */
export function DrawnCard({
  card,
  fresh,
}: {
  card: NonNullable<MonopolyTableView['card']>;
  fresh: boolean;
}) {
  return (
    <div className={`mnp-card mnp-card--${card.deck}${fresh ? ' is-fresh' : ''}`} role="status">
      <span className="mnp-card__head">
        {card.deck === 'chance' ? 'Chance' : 'Community Chest'}
      </span>
      <span className="mnp-card__text">{card.text}</span>
    </div>
  );
}

export { GO_TO_JAIL };
