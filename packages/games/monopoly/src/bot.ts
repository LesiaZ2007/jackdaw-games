import { botChoose, botSlips, type BotContext, type BotLevel } from '@jackdaw/engine';
import { BAIL, DEEDS, deedAt, setOf, streetAt, unmortgageCost } from './board';
import {
  buildBlock,
  raisePlan,
  type MonopolyAction,
  type MonopolyPlayerView,
  type MonopolyState,
  type MonopolyTableView,
  type TradeSide,
} from './rules';

/**
 * A computer player for Monopoly, working from its own seat's view (everything at the table is
 * public). It rolls, pays bail early in the game, buys what it can afford with a cash cushion
 * (and anything that completes a set or stops a rival's), bids up to a valuation at auctions,
 * raises money by the rules' own plan when in debt, lifts mortgages and builds evenly when it is
 * comfortable, and answers trade offers by weighing what it gets against what it gives. It never
 * proposes trades. Easy is looser with cash and slips more; Hard keeps a thinner cushion and
 * pays more for sets.
 */

type Ctx = BotContext<MonopolyPlayerView, MonopolyTableView>;

const RESERVE: Record<BotLevel, number> = { easy: 60, normal: 150, hard: 100 };
const BUILD_RESERVE: Record<BotLevel, number> = { easy: 250, normal: 200, hard: 120 };
const TRADE_MARGIN: Record<BotLevel, number> = { easy: 1, normal: 1.2, hard: 1.35 };

/** The helpers in rules.ts take the whole state; a view carries every field they read. */
const asState = (view: MonopolyPlayerView) => view as unknown as MonopolyState;

const ownerOf = (view: MonopolyTableView, space: number) =>
  view.deeds[String(space)]?.owner ?? null;

/** Would taking this deed complete a set for `me`, or take it from a rival who holds the rest? */
function setRole(view: MonopolyTableView, space: number, me: string) {
  const others = setOf(space).filter((d) => d !== space);
  const owners = others.map((d) => ownerOf(view, d));
  const completes = others.length > 0 && owners.every((o) => o === me);
  const first = owners[0];
  const blocks = others.length > 0 && !!first && first !== me && owners.every((o) => o === first);
  const mine = owners.filter((o) => o === me).length;
  return { completes, blocks, mine };
}

export function monopolyBot(ctx: Ctx): MonopolyAction | null {
  const { view, playerId: me, rng, level } = ctx;
  const seat = view.seats[me];
  if (!seat || seat.out || view.phase === 'show' || view.phase === 'over') return null;

  const offer = view.offers.find((o) => o.to === me);
  if (offer && view.phase !== 'auction') {
    return { type: weighOffer(view, me, offer, level) ? 'accept' : 'reject', id: offer.id };
  }

  switch (view.phase) {
    case 'auction':
      return auctionMove(view, me, rng, level);
    case 'debt': {
      const head = view.debts[0];
      if (!head || head.from !== me) return null;
      return raisePlan(asState(view), me, head.amount)[0] ?? { type: 'bankrupt' };
    }
    case 'roll': {
      if (view.turn !== me) return null;
      if (seat.jailed) {
        if (seat.cards > 0) return { type: 'useCard' };
        const unowned = DEEDS.filter((d) => !view.deeds[String(d)]).length;
        if (unowned >= 10 && seat.cash >= BAIL + RESERVE[level] + 100) return { type: 'bail' };
      }
      return { type: 'roll' };
    }
    case 'buy': {
      if (view.turn !== me || view.pendingBuy === null) return null;
      return buyMove(view, me, seat.cash, view.pendingBuy, rng, level);
    }
    case 'done':
      return view.turn === me ? tidyMove(view, me, rng, level) : null;
    default:
      return null;
  }
}

function buyMove(
  view: MonopolyPlayerView,
  me: string,
  cash: number,
  space: number,
  rng: Ctx['rng'],
  level: BotLevel,
): MonopolyAction {
  const price = deedAt(space)!.price;
  if (cash < price) return { type: 'decline' };
  const role = setRole(view, space, me);
  let reserve = RESERVE[level];
  if (role.completes) reserve = 0;
  else if (role.blocks && level === 'hard') reserve = 0;
  else if (role.mine > 0) reserve = Math.floor(reserve / 2);
  if (cash - price < reserve) return { type: 'decline' };
  if (!role.completes && botSlips(level, rng, 0.5)) return { type: 'decline' };
  return { type: 'buy' };
}

function auctionMove(
  view: MonopolyPlayerView,
  me: string,
  rng: Ctx['rng'],
  level: BotLevel,
): MonopolyAction | null {
  const au = view.auction;
  const cash = view.seats[me]!.cash;
  if (!au || au.out.includes(me) || au.by === me) return null;
  const price = deedAt(au.space)!.price;
  const role = setRole(view, au.space, me);
  let worth = price * (level === 'easy' ? 0.9 : 1);
  if (role.completes) worth = price * (level === 'hard' ? 2.5 : 2);
  else if (role.blocks) worth = price * (level === 'hard' ? 1.6 : 1.3);
  else if (role.mine > 0) worth = price * 1.15;
  const reserve = role.completes ? 0 : level === 'hard' ? 80 : 120;
  const ceiling = Math.min(Math.floor(worth), cash - reserve);
  const next =
    au.high === 0
      ? Math.max(10, Math.floor((price * 0.4) / 10) * 10)
      : au.high + (rng.next() < 0.5 ? 10 : 25);
  if (next <= ceiling) return { type: 'bid', amount: next };
  if (au.high < ceiling) return { type: 'bid', amount: ceiling };
  return { type: 'pass' };
}

/** On a finished turn: lift mortgages when rich, build evenly, then end. */
function tidyMove(
  view: MonopolyPlayerView,
  me: string,
  rng: Ctx['rng'],
  level: BotLevel,
): MonopolyAction {
  const cash = view.seats[me]!.cash;
  const mine = DEEDS.filter((d) => view.deeds[String(d)]?.owner === me);

  const loans = mine.filter(
    (d) => view.deeds[String(d)]!.mortgaged && cash - unmortgageCost(d) >= 350,
  );
  if (loans.length) {
    const pick = botChoose(
      loans,
      (d) =>
        (setRole(view, d, me).completes ? 1000 : 0) +
        setRole(view, d, me).mine * 10 -
        unmortgageCost(d) / 100,
      level,
      rng,
    );
    return { type: 'unmortgage', space: pick };
  }

  if (!botSlips(level, rng, 0.5)) {
    const state = asState(view);
    const sites = mine.filter((d) => {
      const st = streetAt(d);
      return st && cash - st.house >= BUILD_RESERVE[level] && buildBlock(state, me, d) === null;
    });
    if (sites.length) {
      const pick = botChoose(
        sites,
        (d) => {
          const st = streetAt(d)!;
          const h = view.deeds[String(d)]!.houses;
          return -h * 1000 + (st.rent[h + 1]! - st.rent[h]!) / st.house;
        },
        level,
        rng,
      );
      return { type: 'build', space: pick };
    }
  }
  return { type: 'end' };
}

/* ------------------------------------------------------------------ trade offers */

function deedWorth(space: number, mortgaged: boolean): number {
  return deedAt(space)!.price * (mortgaged ? 0.6 : 1);
}

function weighOffer(
  view: MonopolyPlayerView,
  me: string,
  offer: { from: string; give: TradeSide; get: TradeSide },
  level: BotLevel,
): boolean {
  const { from, give, get } = offer;
  const seats = view.seats;
  // Check it can go through, so a stale offer is simply turned down.
  if (
    !seats[from] ||
    seats[from]!.out ||
    seats[from]!.cash < give.cash ||
    seats[me]!.cash < get.cash
  ) {
    return false;
  }
  if (seats[me]!.cash - get.cash < 100 && get.cash > 0) return false;
  if (give.cards > seats[from]!.cards || get.cards > seats[me]!.cards) return false;
  for (const d of [...give.deeds, ...get.deeds]) {
    if (setOf(d).some((x) => (view.deeds[String(x)]?.houses ?? 0) > 0)) return false;
  }
  if (
    give.deeds.some((d) => ownerOf(view, d) !== from) ||
    get.deeds.some((d) => ownerOf(view, d) !== me)
  ) {
    return false;
  }

  /** Who owns a deed once the trade is done. */
  const after = (space: number) => {
    if (give.deeds.includes(space)) return me;
    if (get.deeds.includes(space)) return from;
    return ownerOf(view, space);
  };
  const fullFor = (id: string, space: number, owner: (d: number) => string | null) =>
    setOf(space).every((d) => owner(d) === id);

  let got = give.cash + give.cards * 50;
  let lost = get.cash + get.cards * 50;
  for (const d of give.deeds) {
    got += deedWorth(d, view.deeds[String(d)]!.mortgaged);
    if (fullFor(me, d, after) && !fullFor(me, d, (x) => ownerOf(view, x))) got += 300;
  }
  for (const d of get.deeds) {
    lost += deedWorth(d, view.deeds[String(d)]!.mortgaged);
    if (fullFor(me, d, (x) => ownerOf(view, x))) lost += 400;
    if (fullFor(from, d, after) && !fullFor(from, d, (x) => ownerOf(view, x))) lost += 600;
  }
  return got >= lost * TRADE_MARGIN[level] + 50;
}
