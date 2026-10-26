'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Token, type ScreenPlayer } from '@jackdaw/ui';
import { BOARD, deedAt, setOf, spaceName, streetAt, type Group } from '../board';
import { cardById, cardText } from '../cards';
import type { LogEntry, MonopolyTableView } from '../rules';
import {
  ArtArrow,
  ArtBag,
  ArtBank,
  ArtBars,
  ArtHotel,
  ArtHouse,
  ArtSwap,
  ArtCar,
  ArtChest,
  ArtCop,
  ArtRing,
  ArtTrain,
  ArtBulb,
  ArtTap,
} from './art';
import { Dice, GROUP_INK, money, tintOf } from './board';

const say = (text: string, name: (id: string) => string) =>
  text.replace(/\{([^}]+)\}/g, (_, id: string) => name(id));

/** The moments worth a popup. Rolls, building and offers have their own places on screen. */
const SHOWN = new Set<LogEntry['kind']>([
  'rent',
  'card',
  'tax',
  'cash',
  'jail',
  'buy',
  'auction',
  'build',
  'bank',
  'trade',
  'roll',
]);

/** A popup: a log entry, or one the screen makes up (doubles, a full set, several builds). */
type PopEntry = Omit<LogEntry, 'kind'> & {
  kind: LogEntry['kind'] | 'doubles' | 'set';
  count?: number;
  group?: Group;
};

const GROUP_NAME: Record<Group, string> = {
  brown: 'Browns',
  sky: 'Light Blues',
  pink: 'Pinks',
  orange: 'Oranges',
  red: 'Reds',
  yellow: 'Yellows',
  green: 'Greens',
  navy: 'Dark Blues',
};

/** Small news moves on by itself even when it's yours; the big moments wait for a tap. */
function quick(e: PopEntry): boolean {
  if (e.kind === 'jail') return !e.text.includes('went to Jail');
  return ['doubles', 'build', 'bank', 'cash', 'auction', 'buy'].includes(e.kind);
}

/** Turn new log lines into popups: doubles picked out of rolls, a run of builds in one, a full set. */
function collect(t: MonopolyTableView, after: number): PopEntry[] {
  const out: PopEntry[] = [];
  for (const e of t.log) {
    if (e.seq <= after || !SHOWN.has(e.kind) || !worthIt(e)) continue;
    if (e.kind === 'roll') {
      out.push({ ...e, kind: 'doubles' });
      continue;
    }
    const last = out[out.length - 1];
    if (e.kind === 'build' && last?.kind === 'build' && last.by === e.by && sameWay(last, e)) {
      out[out.length - 1] = { ...last, count: (last.count ?? 1) + 1, space: e.space, seq: e.seq };
      continue;
    }
    out.push(e);
    const st = e.kind === 'buy' && e.space !== undefined ? streetAt(e.space) : null;
    if (st && setOf(e.space!).every((d) => t.deeds[String(d)]?.owner === e.by)) {
      out.push({ ...e, kind: 'set', group: st.group, seq: e.seq + 0.5 });
    }
  }
  return out;
}

const sameWay = (a: PopEntry, b: PopEntry) =>
  a.text.includes(' sold ') === b.text.includes(' sold ');
/** How long a popup that isn't about you stays before it moves on. */
const AUTO_MS = 3_800;
/** Your own small news moves on quicker. */
const QUICK_MS = 2_400;
const KEEP = 4;

/**
 * Popups for what just happened: a card drawn, rent paid, a tax, GO, Jail, a purchase. They
 * queue up and show one at a time. One about you waits for a tap; one about others moves on by
 * itself. On the TV every popup moves on by itself. A refresh starts with an empty queue.
 */
export function Popups({
  t,
  me,
  players,
  tv = false,
}: {
  t: MonopolyTableView;
  me: string | null;
  players: ScreenPlayer[];
  tv?: boolean;
}) {
  const [seen, setSeen] = useState(t.seq);
  const [queue, setQueue] = useState<PopEntry[]>([]);
  if (t.seq !== seen) {
    const fresh = collect(t, seen);
    setSeen(t.seq);
    if (fresh.length) setQueue((q) => trim([...q, ...fresh], me));
  }
  const top = queue[0];
  const mine = Boolean(top && me && involves(top, me));
  const auto = Boolean(tv || !mine || (top && quick(top)));
  const wait = mine && !tv ? QUICK_MS : AUTO_MS;
  const next = () => setQueue((q) => q.slice(1));

  useEffect(() => {
    if (!top || !auto) return;
    const id = window.setTimeout(() => setQueue((q) => (q[0] === top ? q.slice(1) : q)), wait);
    return () => window.clearTimeout(id);
  }, [top, auto, wait]);

  useEffect(() => {
    if (!top) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') setQueue((q) => q.slice(1));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [top]);

  if (!top) return null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => (id === me ? 'You' : (byId.get(id)?.name ?? 'Someone'));
  const view = describe(top, t, me, name);
  return (
    <div
      className={`mnp-pop${tv ? ' mnp-pop--tv' : auto ? ' mnp-pop--aside' : ''}`}
      role="presentation"
    >
      {top.kind === 'jail' && (tv || mine) && (
        <span key={`bars-${top.seq}`} className="mnp-bars" aria-hidden="true">
          {Array.from({ length: 9 }, (_, k) => (
            <span key={k} className="mnp-bars__bar" style={{ '--k': k } as CSSProperties} />
          ))}
          <span className="mnp-bars__rail mnp-bars__rail--top" />
          <span className="mnp-bars__rail mnp-bars__rail--low" />
        </span>
      )}
      <button
        type="button"
        key={top.seq}
        className={`mnp-pop__card mnp-pop--${view.tone}${auto ? ' is-auto' : ''}`}
        style={{ '--band': view.band, '--auto': `${wait}ms` } as CSSProperties}
        onClick={next}
        aria-live="polite"
      >
        <span className="mnp-pop__band">{view.kicker}</span>
        <span className="mnp-pop__art">{view.art}</span>
        <span className="mnp-pop__title">{view.title}</span>
        {view.flow && (
          <span className="mnp-pop__flow">
            <Who p={byId.get(view.flow.from)} label={name(view.flow.from)} />
            <span className="mnp-pop__notes" aria-hidden="true">
              <span className="mnp-flynote" />
              <span className="mnp-flynote" />
              <span className="mnp-flynote" />
            </span>
            {view.flow.to ? (
              <Who p={byId.get(view.flow.to)} label={name(view.flow.to)} />
            ) : (
              <span className="mnp-pop__bank">Bank</span>
            )}
          </span>
        )}
        {view.amount && (
          <span className={`mnp-pop__amount is-${view.amount.sign}`}>{view.amount.text}</span>
        )}
        {view.body && <span className="mnp-pop__body">{view.body}</span>}
        <span className="mnp-pop__tap">
          {auto
            ? tv
              ? ''
              : 'Tap to skip'
            : queue.length > 1
              ? `Tap to continue (${queue.length - 1} more)`
              : 'Tap to continue'}
        </span>
        {auto && <span className="mnp-pop__timer" aria-hidden="true" />}
      </button>
    </div>
  );
}

function Who({ p, label }: { p: ScreenPlayer | undefined; label: string }) {
  return (
    <span className="mnp-pop__who" style={{ '--tint': tintOf(p) } as CSSProperties}>
      {p && <Token avatar={p.avatar} size={44} />}
      <span>{label}</span>
    </span>
  );
}

/** Passing GO for nothing, a bail, rolls in Jail: skip the noise. */
function worthIt(e: LogEntry): boolean {
  if (e.kind === 'roll') return /rolled (\d) and \1\.$/.test(e.text);
  if (e.kind === 'trade') return e.text.includes(' took ');
  if (e.kind === 'auction')
    return e.text.startsWith('Nobody') || e.text.includes('goes to auction');
  return true;
}

function involves(e: PopEntry, me: string): boolean {
  return e.by === me || e.to === me || e.text.includes(`{${me}}`);
}

function trim(q: PopEntry[], me: string | null): PopEntry[] {
  if (q.length <= KEEP) return q;
  const head = q[0]!;
  const rest = q.slice(1);
  const kept = rest.filter((e) => me && involves(e, me));
  const others = rest.filter((e) => !(me && involves(e, me))).slice(-(KEEP - 1));
  return [head, ...rest.filter((e) => kept.includes(e) || others.includes(e))];
}

interface PopView {
  tone: 'good' | 'bad' | 'plain' | 'chance' | 'chest';
  band: string;
  kicker: string;
  art: ReactNode;
  title: string;
  flow?: { from: string; to: string | null };
  amount?: { text: string; sign: 'up' | 'down' | 'even' };
  body?: string;
}

const doublesOf = (text: string): [number, number] => {
  const n = Number(/rolled (\d)/.exec(text)?.[1] ?? 6);
  return [n, n];
};

function deedBand(space: number | undefined): string {
  if (space === undefined) return 'var(--mnp-ink)';
  const st = streetAt(space);
  if (st) return GROUP_INK[st.group];
  return deedAt(space)?.kind === 'utility' ? 'var(--mnp-util)' : 'var(--mnp-ink)';
}

function deedArt(space: number | undefined): ReactNode {
  const deed = space === undefined ? null : deedAt(space);
  if (!deed) return <ArtBag />;
  if (deed.kind === 'railroad') return <ArtTrain />;
  if (deed.kind === 'utility') return space === 12 ? <ArtBulb /> : <ArtTap />;
  return <span className="mnp-pop__deed" style={{ '--band': deedBand(space) } as CSSProperties} />;
}

function describe(
  e: PopEntry,
  t: MonopolyTableView,
  me: string | null,
  name: (id: string) => string,
): PopView {
  const by = e.by ?? '';
  const you = by === me;
  const place = e.space !== undefined ? spaceName(e.space, t.names) : '';
  const amount = e.amount ?? 0;
  switch (e.kind) {
    case 'rent': {
      const paidYou = e.to === me;
      return {
        tone: you ? 'bad' : paidYou ? 'good' : 'plain',
        band: deedBand(e.space),
        kicker: 'Rent',
        art: deedArt(e.space),
        title: you
          ? `You pay ${name(e.to!)} rent`
          : paidYou
            ? `${name(by)} pays you rent`
            : `${name(by)} pays ${name(e.to!)}`,
        flow: { from: by, to: e.to ?? null },
        amount: {
          text: `${you ? '−' : paidYou ? '+' : ''}${money(amount)}`,
          sign: you ? 'down' : paidYou ? 'up' : 'even',
        },
        body: place,
      };
    }
    case 'card': {
      const deck = e.card ? cardById(e.card).deck : 'chance';
      return {
        tone: deck,
        band: deck === 'chance' ? 'var(--mnp-chance)' : 'var(--mnp-chest)',
        kicker: deck === 'chance' ? 'Chance' : 'Community Chest',
        art: deck === 'chance' ? <span className="mnp-q mnp-q--orange">?</span> : <ArtChest />,
        title: you ? 'You draw a card' : `${name(by)} draws a card`,
        body: e.card ? cardText(e.card, t.names) : say(e.text, name),
      };
    }
    case 'tax':
      return {
        tone: you ? 'bad' : 'plain',
        band: 'var(--mnp-red)',
        kicker: BOARD[e.space ?? 4]!.name,
        art: e.space === 38 ? <ArtRing /> : <ArtBag />,
        title: you ? 'You pay the tax' : `${name(by)} pays the tax`,
        flow: { from: by, to: null },
        amount: { text: `${you ? '−' : ''}${money(amount)}`, sign: you ? 'down' : 'even' },
      };
    case 'cash': {
      const parking = e.text.includes('Free Parking');
      return {
        tone: you ? 'good' : 'plain',
        band: parking ? 'var(--mnp-red)' : 'var(--mnp-green)',
        kicker: parking ? 'Free Parking' : 'GO',
        art: parking ? <ArtCar /> : <ArtArrow />,
        title: parking
          ? you
            ? 'You take the pot'
            : `${name(by)} takes the pot`
          : you
            ? 'You pass GO'
            : `${name(by)} passes GO`,
        amount: { text: `+${money(amount)}`, sign: you ? 'up' : 'even' },
        body: parking ? undefined : 'Collect your salary.',
      };
    }
    case 'jail': {
      const went = e.text.includes('went to Jail');
      const out = e.text.includes('walked out')
        ? you
          ? 'You roll doubles and walk free'
          : `${name(by)} rolls doubles and walks free`
        : e.text.includes('card')
          ? `${you ? 'You use' : `${name(by)} uses`} a Get out of Jail free card`
          : `${you ? 'You pay' : `${name(by)} pays`} the fine and go free`;
      return {
        tone: went ? (you ? 'bad' : 'plain') : you ? 'good' : 'plain',
        band: 'var(--mnp-orange)',
        kicker: went ? 'Go to Jail' : 'Out of Jail',
        art: went ? <ArtCop /> : <ArtBars />,
        title: went ? (you ? 'You go to Jail' : `${name(by)} goes to Jail`) : out,
        body: went ? 'Straight there. Do not pass GO, do not collect $200.' : undefined,
        amount: !went && amount ? { text: money(amount), sign: you ? 'down' : 'even' } : undefined,
      };
    }
    case 'buy':
      return {
        tone: you ? 'good' : 'plain',
        band: deedBand(e.space),
        kicker: e.text.includes('auction') ? 'Sold at auction' : 'Sold',
        art: deedArt(e.space),
        title: you ? `${place} is yours` : `${name(by)} buys ${place}`,
        amount: { text: money(amount), sign: 'even' },
      };
    case 'doubles':
      return {
        tone: you ? 'good' : 'plain',
        band: 'var(--mnp-yellow)',
        kicker: 'Doubles',
        art: <Dice dice={doublesOf(e.text)} rolls={e.seq} size={34} />,
        title: you ? 'Doubles! Roll again' : `${name(by)} rolls doubles`,
      };
    case 'build': {
      const n = e.count ?? 1;
      const sold = e.text.includes(' sold ');
      const hotel = !sold && e.text.includes('hotel');
      const what = hotel ? (n > 1 ? `${n} hotels` : 'a hotel') : n > 1 ? `${n} houses` : 'a house';
      return {
        tone: sold ? 'plain' : you ? 'good' : 'plain',
        band: deedBand(e.space),
        kicker: sold ? 'Sold back' : hotel ? 'Hotel' : 'Building',
        art: (
          <span className="mnp-pop__built">
            {hotel ? (
              <ArtHotel />
            ) : (
              Array.from({ length: Math.min(n, 4) }, (_, k) => <ArtHouse key={k} />)
            )}
          </span>
        ),
        title: sold
          ? `${you ? 'You sell' : `${name(by)} sells`} ${n > 1 ? `${n} buildings` : 'a building'}`
          : `${you ? 'You build' : `${name(by)} builds`} ${what}`,
        body: place,
      };
    }
    case 'bank': {
      const lift = e.text.includes('lifted');
      return {
        tone: 'plain',
        band: 'var(--mnp-util)',
        kicker: lift ? 'Mortgage lifted' : 'Mortgaged',
        art: <ArtBank />,
        title: lift
          ? `${you ? 'You buy' : `${name(by)} buys`} back ${place}`
          : `${you ? 'You mortgage' : `${name(by)} mortgages`} ${place}`,
        body: lift ? 'It collects rent again.' : 'No rent is paid on it until it is bought back.',
      };
    }
    case 'trade':
      return {
        tone: me && e.text.includes(`{${me}}`) ? 'good' : 'plain',
        band: 'var(--mnp-green)',
        kicker: 'Trade done',
        art: <ArtSwap />,
        title: 'It’s a deal',
        body: say(e.text, name).replace(/^.*?trade: /, ''),
      };
    case 'set':
      return {
        tone: you ? 'good' : 'plain',
        band: e.group ? GROUP_INK[e.group] : 'var(--mnp-ink)',
        kicker: 'Monopoly!',
        art: (
          <span className="mnp-pop__set" style={{ '--band': deedBand(e.space) } as CSSProperties}>
            <span className="mnp-pop__deed" />
            <span className="mnp-pop__deed" />
            <span className="mnp-pop__deed" />
          </span>
        ),
        title: `${you ? 'You own' : `${name(by)} owns`} all the ${e.group ? GROUP_NAME[e.group] : 'set'}`,
        body: 'Rent doubles, and houses can go up now.',
      };
    case 'auction':
      return e.text.startsWith('Nobody')
        ? {
            tone: 'plain',
            band: deedBand(e.space),
            kicker: 'No sale',
            art: deedArt(e.space),
            title: `Nobody bought ${place}`,
            body: 'It stays with the bank.',
          }
        : {
            tone: 'plain',
            band: deedBand(e.space),
            kicker: 'Auction',
            art: deedArt(e.space),
            title: `${place} goes to auction`,
            body: 'Everyone can bid. Highest bid takes it.',
          };
    default:
      return {
        tone: 'plain',
        band: deedBand(e.space),
        kicker: 'Auction',
        art: deedArt(e.space),
        title: say(e.text, name),
      };
  }
}
