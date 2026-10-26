import { createRng, GameError, type Rng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { CHANCE, CHEST, cardText } from './cards';
import { UTILITIES, RAILROADS, spaceName } from './board';
import {
  AUCTION_MS,
  SHOW_MS,
  describeSide,
  liquidValue,
  monopoly as game,
  netWorth,
  rentFor,
  type MonopolyAction,
  type MonopolyOptions,
  type MonopolyState,
  type TradeSide,
} from './rules';

/* ------------------------------------------------------------------ helpers */

/** A fake Rng whose dice come from a script: dice(3, 4) throws a 3 and a 4, then 1s. */
function dice(...faces: number[]): Rng {
  let i = 0;
  return {
    next: () => 0,
    int: () => {
      const face = faces[i++];
      return face === undefined ? 0 : face - 1;
    },
    pick: (items) => items[0]!,
    shuffle: (items) => items.slice(),
    get state() {
      return 0;
    },
  };
}

const TWO = ['wren', 'rook'];
const THREE = ['wren', 'rook', 'magpie'];

/** A fresh game with the given players seated in the order listed, the first to move. */
function base(
  players: string[] = TWO,
  options: Partial<MonopolyOptions> = {},
  now = 1_000,
): MonopolyState {
  const s = game.setup({
    playerIds: players,
    options: { ...game.defaultOptions(players.length), ...options },
    rng: createRng(1),
    now,
  });
  s.order = players.slice();
  s.turn = players[0]!;
  return s;
}

function edit(s: MonopolyState, fn: (draft: MonopolyState) => void): MonopolyState {
  const copy = structuredClone(s);
  fn(copy);
  return copy;
}

function act(
  s: MonopolyState,
  id: string,
  action: MonopolyAction,
  rng: Rng = createRng(1),
  now = 5_000,
) {
  return game.applyAction(s, id, action, rng, now);
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof GameError) return e.code;
    throw e;
  }
  return null;
}

const seat = (s: MonopolyState, id: string) => s.seats[id]!;
const deed = (s: MonopolyState, space: number) => s.deeds[String(space)];
const side = (part: Partial<TradeSide> = {}): TradeSide => ({
  cash: 0,
  deeds: [],
  cards: 0,
  ...part,
});

function own(
  s: MonopolyState,
  id: string,
  spaces: readonly number[],
  houses = 0,
  mortgaged = false,
) {
  for (const sp of spaces) s.deeds[String(sp)] = { owner: id, mortgaged, houses };
}

/** Put one card on top of a deck, keeping all sixteen in it. */
function topCard(s: MonopolyState, deck: 'chance' | 'chest', id: string) {
  s.decks[deck] = [id, ...s.decks[deck].filter((c) => c !== id)];
}

/** Hand a player a card that was in a deck. */
function giveCard(s: MonopolyState, to: string, id: string) {
  const deck = id.startsWith('chance') ? 'chance' : 'chest';
  s.decks[deck] = s.decks[deck].filter((c) => c !== id);
  seat(s, to).cards.push(id);
}

/** The tenant (whose turn it is) throws the dice from a place that lands them on `at`. */
function landOn(s: MonopolyState, tenant: string, at: number, a: number, b: number): MonopolyState {
  const t = edit(s, (d) => {
    d.turn = tenant;
    d.phase = 'roll';
    seat(d, tenant).pos = (at - a - b + 40) % 40;
  });
  return act(t, tenant, { type: 'roll' }, dice(a, b));
}

/** How much the owner collected when the tenant landed on `at`. */
function rentCollected(
  s: MonopolyState,
  at: number,
  a: number,
  b: number,
  owner = 'wren',
  tenant = 'rook',
) {
  const before = seat(s, owner).cash;
  const after = landOn(s, tenant, at, a, b);
  return seat(after, owner).cash - before;
}

/** Wren holds the brown pair with hotels-or-houses; rook, to move at GO, owes $320 on Crowsfoot Alley. */
function debtScene(players: string[] = TWO, rookHolds: number[] = [21, 23, 24], rookHouses = 0) {
  const s = edit(base(players), (d) => {
    own(d, 'wren', [1, 3], 4);
    own(d, 'rook', rookHolds, rookHouses);
    seat(d, 'rook').cash = 100;
    d.turn = 'rook';
  });
  return act(s, 'rook', { type: 'roll' }, dice(1, 2));
}

/* ------------------------------------------------------------------ setup */

describe('setup', () => {
  it('gives every player $1500 on GO and nothing owned', () => {
    const s = base(['wren', 'rook', 'magpie', 'robin']);
    for (const id of ['wren', 'rook', 'magpie', 'robin']) {
      expect(seat(s, id).cash).toBe(1500);
      expect(seat(s, id).pos).toBe(0);
      expect(seat(s, id).jailed).toBe(false);
      expect(seat(s, id).cards).toEqual([]);
    }
    expect(s.deeds).toEqual({});
    expect(s.phase).toBe('roll');
    expect(s.round).toBe(1);
  });

  it('draws the turn order as a shuffle of the players, and the first in it moves', () => {
    const ids = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron'];
    const s = game.setup({
      playerIds: ids,
      options: game.defaultOptions(6),
      rng: createRng(7),
      now: 0,
    });
    expect(s.order).toEqual(createRng(7).shuffle(ids));
    expect([...s.order].sort()).toEqual([...ids].sort());
    expect(s.turn).toBe(s.order[0]);
    const orders = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const g = game.setup({
        playerIds: ids,
        options: game.defaultOptions(6),
        rng: createRng(seed),
        now: 0,
      });
      orders.add(g.order.join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('holds all 16 Chance and all 16 Community Chest cards in the decks', () => {
    const s = base();
    expect(s.decks.chance).toHaveLength(16);
    expect(s.decks.chest).toHaveLength(16);
    expect([...s.decks.chance].sort()).toEqual(CHANCE.map((c) => c.id).sort());
    expect([...s.decks.chest].sort()).toEqual(CHEST.map((c) => c.id).sort());
  });

  it('shuffles the decks (not left in printed order)', () => {
    const s = base();
    expect(s.decks.chance).not.toEqual(CHANCE.map((c) => c.id));
    expect(s.decks.chest).not.toEqual(CHEST.map((c) => c.id));
  });

  it('defaults: last one standing, auctions, no pot, no timer', () => {
    const s = base();
    expect(s.maxRounds).toBe(0);
    expect(s.auctions).toBe(true);
    expect(s.parkingPot).toBe(true);
    expect(s.turnSecs).toBe(0);
    expect(s.actBy).toBeNull();
    expect(game.nextTimer!(s)).toBeNull();
    expect(s.bankHouses).toBe(32);
    expect(s.bankHotels).toBe(12);
  });

  it('maps the options to the rules', () => {
    const s30 = base(TWO, { ends: 'After 30 rounds' });
    expect(s30.maxRounds).toBe(30);
    expect(base(TWO, { ends: 'After 20 rounds' }).maxRounds).toBe(20);
    expect(base(TWO, { unbought: 'Stays with the bank' }).auctions).toBe(false);
    expect(base(TWO, { parking: 'Collects the taxes' }).parkingPot).toBe(true);
    const timed = game.setup({
      playerIds: TWO,
      options: { ...game.defaultOptions(2), turnTimer: '90 seconds' },
      rng: createRng(1),
      now: 2_000,
    });
    expect(timed.turnSecs).toBe(90);
    expect(timed.actBy).toBe(2_000 + 90_000);
    expect(base(TWO, { turnTimer: '60 seconds' }, 0).turnSecs).toBe(60);
  });

  it('validates the player count', () => {
    expect(game.validateOptions!(game.defaultOptions(1), 1)).not.toBeNull();
    expect(game.validateOptions!(game.defaultOptions(2), 2)).toBeNull();
    expect(game.validateOptions!(game.defaultOptions(6), 6)).toBeNull();
    expect(game.validateOptions!(game.defaultOptions(7), 7)).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ rolling and moving */

describe('rolling and moving', () => {
  it('moves the token by the dice and offers an unowned street', () => {
    const s = act(base(), 'wren', { type: 'roll' }, dice(1, 2));
    expect(seat(s, 'wren').pos).toBe(3);
    expect(s.dice).toEqual([1, 2]);
    expect(s.rolls).toBe(1);
    expect(s.phase).toBe('buy');
    expect(s.pendingBuy).toBe(3);
  });

  it('only the player to move can roll, and only in the roll phase', () => {
    const s = base();
    expect(codeOf(() => act(s, 'rook', { type: 'roll' }))).toBe('NOT_YOUR_TURN');
    const rolled = act(s, 'wren', { type: 'roll' }, dice(1, 2));
    expect(codeOf(() => act(rolled, 'wren', { type: 'roll' }))).toBe('NOT_YOUR_TURN');
    expect(codeOf(() => act(s, 'nobody', { type: 'roll' }))).toBe('NOT_A_PLAYER');
  });

  it('collects $200 for passing GO', () => {
    const s = edit(base(), (d) => {
      seat(d, 'wren').pos = 38;
    });
    const after = act(s, 'wren', { type: 'roll' }, dice(1, 2));
    expect(seat(after, 'wren').pos).toBe(1);
    expect(seat(after, 'wren').cash).toBe(1700);
  });

  it('collects $200 for landing exactly on GO', () => {
    const s = edit(base(), (d) => {
      seat(d, 'wren').pos = 35;
    });
    const after = act(s, 'wren', { type: 'roll' }, dice(2, 3));
    expect(seat(after, 'wren').pos).toBe(0);
    expect(seat(after, 'wren').cash).toBe(1700);
  });

  it('a non-double ends the roll phase once the landing is dealt with', () => {
    const s = act(base(), 'wren', { type: 'roll' }, dice(1, 3));
    expect(seat(s, 'wren').pos).toBe(4);
    expect(seat(s, 'wren').cash).toBe(1300);
    expect(s.phase).toBe('done');
  });

  it('doubles give another roll', () => {
    const s = act(base(), 'wren', { type: 'roll' }, dice(2, 2));
    expect(seat(s, 'wren').pos).toBe(4);
    expect(s.doubles).toBe(1);
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe('wren');
  });

  it('doubles still let you buy first, then roll again', () => {
    const s = edit(base(), (d) => {
      seat(d, 'wren').pos = 1;
    });
    const rolled = act(s, 'wren', { type: 'roll' }, dice(1, 1));
    expect(rolled.phase).toBe('buy');
    const bought = act(rolled, 'wren', { type: 'buy' });
    expect(bought.phase).toBe('roll');
  });

  it('three doubles in a row send you to Jail without moving', () => {
    const s = edit(base(), (d) => {
      d.doubles = 2;
      seat(d, 'wren').pos = 5;
    });
    const after = act(s, 'wren', { type: 'roll' }, dice(1, 1));
    expect(seat(after, 'wren').jailed).toBe(true);
    expect(seat(after, 'wren').pos).toBe(10);
    expect(after.phase).toBe('done');
  });

  it('landing on Go to Jail sends you to Jail and ends the turn', () => {
    const s = edit(base(), (d) => {
      seat(d, 'wren').pos = 25;
    });
    const after = act(s, 'wren', { type: 'roll' }, dice(2, 3));
    expect(seat(after, 'wren').jailed).toBe(true);
    expect(seat(after, 'wren').pos).toBe(10);
    expect(seat(after, 'wren').cash).toBe(1500);
    expect(after.phase).toBe('done');
  });

  it('doubles into Go to Jail give no extra roll', () => {
    const s = edit(base(), (d) => {
      seat(d, 'wren').pos = 28;
    });
    const after = act(s, 'wren', { type: 'roll' }, dice(1, 1));
    expect(seat(after, 'wren').jailed).toBe(true);
    expect(after.phase).toBe('done');
  });

  it('ending the turn passes the dice on and resets the doubles', () => {
    let s = act(base(), 'wren', { type: 'roll' }, dice(1, 3));
    s = act(s, 'wren', { type: 'end' });
    expect(s.turn).toBe('rook');
    expect(s.phase).toBe('roll');
    expect(s.doubles).toBe(0);
    expect(s.round).toBe(1);
    s = act(s, 'rook', { type: 'roll' }, dice(1, 3));
    s = act(s, 'rook', { type: 'end' });
    expect(s.turn).toBe('wren');
    expect(s.round).toBe(2);
  });

  it('cannot end the turn before rolling', () => {
    expect(codeOf(() => act(base(), 'wren', { type: 'end' }))).toBe('NOT_YOUR_TURN');
  });

  it('does not mutate the state it is given', () => {
    const s = base();
    const copy = structuredClone(s);
    act(s, 'wren', { type: 'roll' }, dice(1, 2));
    expect(s).toEqual(copy);
  });

  it('pays the tax, and with the pot rule Free Parking collects it', () => {
    let s = base(TWO, { parking: 'Collects the taxes' });
    s = edit(s, (d) => {
      seat(d, 'wren').pos = 1;
    });
    s = act(s, 'wren', { type: 'roll' }, dice(1, 2));
    expect(seat(s, 'wren').cash).toBe(1300);
    expect(s.pot).toBe(200);
    s = landOn(s, 'rook', 20, 3, 4);
    expect(seat(s, 'rook').cash).toBe(1700);
    expect(s.pot).toBe(0);
  });

  it('without the pot rule taxes vanish and Free Parking pays nothing', () => {
    let s = edit(base(TWO, { parking: 'Nothing' }), (d) => {
      seat(d, 'wren').pos = 1;
    });
    s = act(s, 'wren', { type: 'roll' }, dice(1, 2));
    expect(s.pot).toBe(0);
    s = landOn(s, 'rook', 20, 3, 4);
    expect(seat(s, 'rook').cash).toBe(1500);
  });
});

/* ------------------------------------------------------------------ cards */

describe('Chance and Community Chest', () => {
  it('Chance: advance to the nearest railroad passes GO from the last Chance space', () => {
    const s = edit(base(), (d) => topCard(d, 'chance', 'chance5'));
    const after = landOn(s, 'rook', 36, 3, 4);
    expect(seat(after, 'rook').pos).toBe(5);
    expect(seat(after, 'rook').cash).toBe(1700);
    expect(after.pendingBuy).toBe(5);
    expect(after.phase).toBe('buy');
  });

  it('drawn cards go to the bottom of the deck', () => {
    const s = edit(base(), (d) => topCard(d, 'chance', 'chance7'));
    const after = landOn(s, 'wren', 7, 3, 4);
    expect(seat(after, 'wren').cash).toBe(1550);
    expect(after.decks.chance.at(-1)).toBe('chance7');
    expect(after.decks.chance).toHaveLength(16);
  });

  it('a Get out of Jail free card is kept by the player, not returned to the deck', () => {
    const s = edit(base(), (d) => topCard(d, 'chance', 'chance8'));
    const after = landOn(s, 'wren', 7, 3, 4);
    expect(seat(after, 'wren').cards).toEqual(['chance8']);
    expect(after.decks.chance).toHaveLength(15);
    expect(after.decks.chance).not.toContain('chance8');
  });

  it('the card goes to jail', () => {
    const s = edit(base(), (d) => topCard(d, 'chance', 'chance10'));
    const after = landOn(s, 'wren', 7, 3, 4);
    expect(seat(after, 'wren').jailed).toBe(true);
    expect(seat(after, 'wren').pos).toBe(10);
    expect(seat(after, 'wren').cash).toBe(1500);
    expect(after.phase).toBe('done');
  });

  it('go back three spaces lands on Income Tax from the first Chance space', () => {
    const s = edit(base(), (d) => topCard(d, 'chance', 'chance9'));
    const after = landOn(s, 'wren', 7, 3, 4);
    expect(seat(after, 'wren').pos).toBe(4);
    expect(seat(after, 'wren').cash).toBe(1300);
  });

  it('repairs charge per house and per hotel', () => {
    const s = edit(base(), (d) => {
      topCard(d, 'chance', 'chance11');
      own(d, 'wren', [1], 2);
      own(d, 'wren', [3], 5);
    });
    const after = landOn(s, 'wren', 7, 3, 4);
    expect(seat(after, 'wren').cash).toBe(1500 - 2 * 25 - 100);
  });

  it('pay each player: the mayor pays everyone else', () => {
    const s = edit(base(THREE), (d) => topCard(d, 'chance', 'chance15'));
    const after = landOn(s, 'wren', 7, 3, 4);
    expect(seat(after, 'wren').cash).toBe(1400);
    expect(seat(after, 'rook').cash).toBe(1550);
    expect(seat(after, 'magpie').cash).toBe(1550);
  });

  it('Community Chest: collect from each player', () => {
    const s = edit(base(THREE), (d) => topCard(d, 'chest', 'chest9'));
    const after = landOn(s, 'wren', 2, 1, 1);
    expect(seat(after, 'wren').cash).toBe(1520);
    expect(seat(after, 'rook').cash).toBe(1490);
    expect(seat(after, 'magpie').cash).toBe(1490);
  });

  it('Community Chest: collect from each with a broke player sends them bankrupt to the collector', () => {
    const s = edit(base(THREE), (d) => {
      topCard(d, 'chest', 'chest9');
      seat(d, 'rook').cash = 5;
    });
    const after = landOn(s, 'wren', 2, 1, 1);
    expect(seat(after, 'rook').out).toBe(true);
    expect(seat(after, 'rook').cash).toBe(0);
    expect(seat(after, 'magpie').cash).toBe(1490);
    expect(seat(after, 'wren').cash).toBe(1500 + 10 + 5);
    expect(after.fallen).toEqual(['rook']);
    expect(after.phase).toBe('roll');
    expect(after.turn).toBe('wren');
  });

  it('Chance: nearest utility is paid ten times a fresh throw, whoever owns it', () => {
    const s = edit(base(), (d) => {
      topCard(d, 'chance', 'chance4');
      own(d, 'wren', [12]);
    });
    const before = seat(s, 'wren').cash;
    // Throw 3 and 4 for the move, then 2 and 3 for the utility.
    const t = edit(s, (d) => {
      d.turn = 'rook';
      seat(d, 'rook').pos = 0;
    });
    const after = act(t, 'rook', { type: 'roll' }, dice(3, 4, 2, 3));
    expect(seat(after, 'rook').pos).toBe(12);
    expect(seat(after, 'wren').cash - before).toBe(50);
  });
});

/* ------------------------------------------------------------------ jail */

describe('jail', () => {
  const jailed = (extra: (d: MonopolyState) => void = () => {}) =>
    edit(base(), (d) => {
      seat(d, 'wren').pos = 10;
      seat(d, 'wren').jailed = true;
      extra(d);
    });

  it('bail costs $50, frees you, and you can then roll', () => {
    const s = act(jailed(), 'wren', { type: 'bail' });
    expect(seat(s, 'wren').jailed).toBe(false);
    expect(seat(s, 'wren').cash).toBe(1450);
    expect(s.phase).toBe('roll');
    const moved = act(s, 'wren', { type: 'roll' }, dice(1, 2));
    expect(seat(moved, 'wren').pos).toBe(13);
  });

  it('bail goes to Free Parking when the pot rule is on', () => {
    const s = edit(jailed(), (d) => {
      d.parkingPot = true;
    });
    expect(act(s, 'wren', { type: 'bail' }).pot).toBe(50);
  });

  it('cannot pay bail when free, or without the cash', () => {
    expect(codeOf(() => act(base(), 'wren', { type: 'bail' }))).toBe('NOT_JAILED');
    const poor = jailed((d) => {
      seat(d, 'wren').cash = 49;
    });
    expect(codeOf(() => act(poor, 'wren', { type: 'bail' }))).toBe('NO_CASH');
  });

  it('a Get out of Jail free card frees you and goes back into its deck', () => {
    const s = jailed((d) => giveCard(d, 'wren', 'chest5'));
    expect(s.decks.chest).toHaveLength(15);
    const after = act(s, 'wren', { type: 'useCard' });
    expect(seat(after, 'wren').jailed).toBe(false);
    expect(seat(after, 'wren').cards).toEqual([]);
    expect(seat(after, 'wren').cash).toBe(1500);
    expect(after.decks.chest).toHaveLength(16);
    expect(after.decks.chest.at(-1)).toBe('chest5');
  });

  it('cannot use a card you do not have, or when free', () => {
    expect(codeOf(() => act(jailed(), 'wren', { type: 'useCard' }))).toBe('NO_CARD');
    expect(codeOf(() => act(base(), 'wren', { type: 'useCard' }))).toBe('NOT_JAILED');
  });

  it('doubles release you and move you, but give no extra roll', () => {
    const after = act(jailed(), 'wren', { type: 'roll' }, dice(3, 3));
    expect(seat(after, 'wren').jailed).toBe(false);
    expect(seat(after, 'wren').pos).toBe(16);
    expect(seat(after, 'wren').cash).toBe(1500);
    expect(after.phase).toBe('buy');
    const bought = act(after, 'wren', { type: 'buy' });
    expect(bought.phase).toBe('done');
    expect(bought.doubles).toBe(0);
  });

  it('a failed roll keeps you in Jail and ends the turn', () => {
    const after = act(jailed(), 'wren', { type: 'roll' }, dice(1, 2));
    expect(seat(after, 'wren').jailed).toBe(true);
    expect(seat(after, 'wren').pos).toBe(10);
    expect(seat(after, 'wren').tries).toBe(1);
    expect(after.phase).toBe('done');
  });

  it('the third failed roll pays $50 and moves by that roll', () => {
    const s = jailed((d) => {
      seat(d, 'wren').tries = 2;
    });
    const after = act(s, 'wren', { type: 'roll' }, dice(1, 2));
    expect(seat(after, 'wren').jailed).toBe(false);
    expect(seat(after, 'wren').cash).toBe(1450);
    expect(seat(after, 'wren').pos).toBe(13);
    expect(after.pendingBuy).toBe(13);
  });

  it('a jailed player still collects rent', () => {
    const s = edit(base(), (d) => {
      own(d, 'rook', [1]);
      seat(d, 'rook').jailed = true;
      seat(d, 'rook').pos = 10;
    });
    expect(rentCollected(s, 1, 1, 2, 'rook', 'wren')).toBe(2);
  });
});

/* ------------------------------------------------------------------ buying and auctions */

describe('buying and auctions', () => {
  const offered = (options: Partial<MonopolyOptions> = {}, players = TWO) =>
    act(base(players, options), 'wren', { type: 'roll' }, dice(1, 2));

  it('buying takes the price and gives the deed', () => {
    const s = act(offered(), 'wren', { type: 'buy' });
    expect(seat(s, 'wren').cash).toBe(1440);
    expect(deed(s, 3)).toEqual({ owner: 'wren', mortgaged: false, houses: 0 });
    expect(s.pendingBuy).toBeNull();
    expect(s.phase).toBe('done');
  });

  it('cannot buy without the cash, or out of turn', () => {
    const poor = edit(offered(), (d) => {
      seat(d, 'wren').cash = 59;
    });
    expect(codeOf(() => act(poor, 'wren', { type: 'buy' }))).toBe('NO_CASH');
    expect(codeOf(() => act(offered(), 'rook', { type: 'buy' }))).toBe('NOT_YOUR_TURN');
  });

  it('declining puts the deed up for auction', () => {
    const s = act(offered(), 'wren', { type: 'decline' }, createRng(1), 5_000);
    expect(s.phase).toBe('auction');
    expect(s.auction).toEqual({ space: 3, high: 0, by: null, out: [], until: 5_000 + AUCTION_MS });
    expect(deed(s, 3)).toBeUndefined();
  });

  it('declining leaves it with the bank when auctions are off', () => {
    const s = act(offered({ unbought: 'Stays with the bank' }), 'wren', { type: 'decline' });
    expect(s.phase).toBe('done');
    expect(s.auction).toBeNull();
    expect(deed(s, 3)).toBeUndefined();
    expect(seat(s, 'wren').cash).toBe(1500);
  });

  describe('auction', () => {
    const auction = (players = TWO) => act(offered({}, players), 'wren', { type: 'decline' });

    it('anyone can bid, higher each time, and a raise restarts the clock', () => {
      let s = act(auction(), 'rook', { type: 'bid', amount: 10 }, createRng(1), 6_000);
      expect(s.auction!.high).toBe(10);
      expect(s.auction!.by).toBe('rook');
      expect(s.auction!.until).toBe(6_000 + AUCTION_MS);
      expect(s.phase).toBe('auction');
      s = act(s, 'wren', { type: 'bid', amount: 11 }, createRng(1), 7_000);
      expect(s.auction!.by).toBe('wren');
      expect(s.auction!.until).toBe(7_000 + AUCTION_MS);
    });

    it('rejects a low bid, a bid over your cash and bids outside an auction', () => {
      const s = act(auction(), 'rook', { type: 'bid', amount: 10 });
      expect(codeOf(() => act(s, 'wren', { type: 'bid', amount: 10 }))).toBe('LOW_BID');
      expect(codeOf(() => act(s, 'wren', { type: 'bid', amount: 1501 }))).toBe('NO_CASH');
      expect(codeOf(() => act(offered(), 'wren', { type: 'bid', amount: 5 }))).toBe('NO_AUCTION');
    });

    it('the top bidder cannot pass', () => {
      const s = act(auction(), 'rook', { type: 'bid', amount: 10 });
      expect(codeOf(() => act(s, 'rook', { type: 'pass' }))).toBe('LEADING');
    });

    it('closes at once when everyone else has passed, and the top bidder pays', () => {
      let s = act(auction(), 'rook', { type: 'bid', amount: 40 });
      s = act(s, 'wren', { type: 'pass' });
      expect(s.auction).toBeNull();
      expect(deed(s, 3)!.owner).toBe('rook');
      expect(seat(s, 'rook').cash).toBe(1460);
      expect(seat(s, 'wren').cash).toBe(1500);
      expect(s.phase).toBe('done');
      expect(s.turn).toBe('wren');
    });

    it('closes when a bidder is the last one left even if bidding from the start', () => {
      let s = act(auction(THREE), 'rook', { type: 'bid', amount: 5 });
      s = act(s, 'wren', { type: 'pass' });
      expect(s.phase).toBe('auction');
      s = act(s, 'magpie', { type: 'pass' });
      expect(s.phase).toBe('done');
      expect(deed(s, 3)!.owner).toBe('rook');
    });

    it('is unsold when everybody passes', () => {
      let s = act(auction(), 'rook', { type: 'pass' });
      expect(s.phase).toBe('auction');
      s = act(s, 'wren', { type: 'pass' });
      expect(s.auction).toBeNull();
      expect(deed(s, 3)).toBeUndefined();
      expect(s.phase).toBe('done');
      expect(seat(s, 'wren').cash).toBe(1500);
      expect(seat(s, 'rook').cash).toBe(1500);
    });

    it('a player who passed cannot bid or pass again', () => {
      const s = act(auction(THREE), 'rook', { type: 'pass' });
      expect(codeOf(() => act(s, 'rook', { type: 'bid', amount: 10 }))).toBe('OUT_OF_AUCTION');
      expect(codeOf(() => act(s, 'rook', { type: 'pass' }))).toBe('OUT_OF_AUCTION');
    });

    it('building and mortgaging wait until the auction is over', () => {
      const s = edit(auction(), (d) => own(d, 'wren', [1]));
      expect(codeOf(() => act(s, 'wren', { type: 'mortgage', space: 1 }))).toBe('NOT_NOW');
    });

    it('nextTimer is the auction deadline, and the timer closes it with the high bidder winning', () => {
      const s = act(auction(), 'rook', { type: 'bid', amount: 10 }, createRng(1), 6_000);
      expect(game.nextTimer!(s)).toEqual({ id: 'auction', at: 6_000 + AUCTION_MS });
      expect(game.onTimer!(s, 'auction', createRng(1), 6_000 + AUCTION_MS - 1)).toBe(s);
      const closed = game.onTimer!(s, 'auction', createRng(1), 6_000 + AUCTION_MS);
      expect(deed(closed, 3)!.owner).toBe('rook');
      expect(seat(closed, 'rook').cash).toBe(1490);
      expect(closed.phase).toBe('done');
      expect(closed.auction).toBeNull();
    });

    it('the timer leaves the deed unsold when nobody bid', () => {
      const s = auction();
      const closed = game.onTimer!(s, 'auction', createRng(1), s.auction!.until);
      expect(deed(closed, 3)).toBeUndefined();
      expect(closed.phase).toBe('done');
    });
  });
});

/* ------------------------------------------------------------------ rent */

describe('rent', () => {
  const brownRent = [
    [0, 2],
    [1, 10],
    [2, 30],
    [3, 90],
    [4, 160],
    [5, 250],
  ] as const;

  it('a bare street owned alone pays the printed rent', () => {
    const s = edit(base(), (d) => own(d, 'wren', [1]));
    expect(rentCollected(s, 1, 2, 3)).toBe(2);
  });

  it('a full colour set with no houses pays double', () => {
    const s = edit(base(), (d) => own(d, 'wren', [1, 3]));
    expect(rentCollected(s, 1, 2, 3)).toBe(4);
    expect(rentCollected(s, 3, 1, 2)).toBe(8);
  });

  it.each(brownRent.filter(([h]) => h > 0))(
    'with %i buildings Mudlark Row pays %i',
    (houses, rent) => {
      const s = edit(base(), (d) => own(d, 'wren', [1, 3], houses));
      expect(rentCollected(s, 1, 2, 3)).toBe(rent);
    },
  );

  it('the tenant pays and the owner collects, and it is recorded for the Landlord award', () => {
    const s = edit(base(), (d) => own(d, 'wren', [1, 3]));
    const after = landOn(s, 'rook', 3, 1, 2);
    expect(seat(after, 'rook').cash).toBe(1492);
    expect(seat(after, 'wren').cash).toBe(1508);
    expect(after.rent['wren']).toBe(8);
    expect(after.phase).toBe('done');
  });

  it('three of the same rent for a different set (green, with a hotel)', () => {
    const s = edit(base(), (d) => own(d, 'wren', [31, 32, 34], 5));
    expect(rentCollected(s, 34, 3, 4)).toBe(1400);
  });

  it.each([
    [1, 25],
    [2, 50],
    [3, 100],
    [4, 200],
  ])('owning %i inns pays %i at a railroad', (count, rent) => {
    const s = edit(base(), (d) => own(d, 'wren', RAILROADS.slice(0, count)));
    expect(rentCollected(s, 5, 2, 3)).toBe(rent);
  });

  it('a utility pays 4 times the dice, or 10 times with both utilities', () => {
    const one = edit(base(), (d) => own(d, 'wren', [12]));
    expect(rentCollected(one, 12, 3, 4)).toBe(28);
    const both = edit(base(), (d) => own(d, 'wren', [...UTILITIES]));
    expect(rentCollected(both, 12, 3, 4)).toBe(70);
    expect(rentCollected(both, 28, 2, 5)).toBe(70);
  });

  it('a mortgaged deed pays nothing', () => {
    const street = edit(base(), (d) => own(d, 'wren', [1], 0, true));
    expect(rentCollected(street, 1, 2, 3)).toBe(0);
    expect(landOn(street, 'rook', 1, 2, 3).phase).toBe('done');
    const inn = edit(base(), (d) => own(d, 'wren', [5], 0, true));
    expect(rentCollected(inn, 5, 2, 3)).toBe(0);
    const guild = edit(base(), (d) => own(d, 'wren', [12], 0, true));
    expect(rentCollected(guild, 12, 3, 4)).toBe(0);
  });

  it('a set with one mortgaged street still pays double on the others', () => {
    const s = edit(base(), (d) => {
      own(d, 'wren', [1]);
      own(d, 'wren', [3], 0, true);
    });
    expect(rentCollected(s, 1, 2, 3)).toBe(4);
  });

  it('you pay nothing on your own deed', () => {
    const s = edit(base(), (d) => own(d, 'wren', [1]));
    const after = landOn(s, 'wren', 1, 2, 3);
    expect(seat(after, 'wren').cash).toBe(1700);
    expect(after.phase).toBe('done');
  });

  it('Chance: nearest railroad pays double rent', () => {
    const s = edit(base(), (d) => {
      topCard(d, 'chance', 'chance5');
      own(d, 'wren', [15]);
    });
    expect(rentCollected(s, 7, 3, 4)).toBe(50);
    const two = edit(s, (d) => own(d, 'wren', [5]));
    expect(rentCollected(two, 7, 3, 4)).toBe(100);
  });

  it('Chance: nearest utility pays ten times a fresh throw even with one utility', () => {
    const s = edit(base(), (d) => {
      topCard(d, 'chance', 'chance4');
      own(d, 'wren', [12]);
    });
    const t = edit(s, (d) => {
      d.turn = 'rook';
      seat(d, 'rook').pos = 0;
    });
    const after = act(t, 'rook', { type: 'roll' }, dice(3, 4, 6, 3));
    expect(seat(after, 'wren').cash - 1500).toBe(90);
    expect(after.dice).toEqual([6, 3]);
  });

  it('rentFor is pure and agrees with play', () => {
    const s = edit(base(), (d) => own(d, 'wren', [31, 32, 34], 1));
    expect(rentFor(s, 34, 7)).toBe(150);
    expect(rentFor(s, 35, 7)).toBe(0);
  });
});

/* ------------------------------------------------------------------ building */

describe('building', () => {
  const brown = (houses = 0, tweak: (d: MonopolyState) => void = () => {}) =>
    edit(base(), (d) => {
      own(d, 'wren', [1, 3], houses);
      tweak(d);
    });

  it('builds a house for its cost and takes it from the bank', () => {
    const s = act(brown(), 'wren', { type: 'build', space: 1 });
    expect(deed(s, 1)!.houses).toBe(1);
    expect(seat(s, 'wren').cash).toBe(1450);
    expect(s.bankHouses).toBe(31);
  });

  it('enforces the even-build rule', () => {
    let s = act(brown(), 'wren', { type: 'build', space: 1 });
    expect(codeOf(() => act(s, 'wren', { type: 'build', space: 1 }))).toBe('CANT_BUILD');
    s = act(s, 'wren', { type: 'build', space: 3 });
    s = act(s, 'wren', { type: 'build', space: 1 });
    expect(deed(s, 1)!.houses).toBe(2);
    expect(deed(s, 3)!.houses).toBe(1);
  });

  it('needs the whole colour group', () => {
    const s = edit(base(), (d) => {
      own(d, 'wren', [1]);
      own(d, 'rook', [3]);
    });
    expect(codeOf(() => act(s, 'wren', { type: 'build', space: 1 }))).toBe('CANT_BUILD');
    const partial = edit(base(), (d) => own(d, 'wren', [6, 8]));
    expect(codeOf(() => act(partial, 'wren', { type: 'build', space: 6 }))).toBe('CANT_BUILD');
  });

  it('is blocked while any deed in the group is mortgaged', () => {
    const s = edit(brown(), (d) => {
      deed(d, 3)!.mortgaged = true;
    });
    expect(codeOf(() => act(s, 'wren', { type: 'build', space: 1 }))).toBe('CANT_BUILD');
  });

  it('only streets can be built on, and only your own', () => {
    const s = edit(brown(), (d) => own(d, 'wren', RAILROADS));
    expect(codeOf(() => act(s, 'wren', { type: 'build', space: 5 }))).toBe('CANT_BUILD');
    expect(codeOf(() => act(s, 'rook', { type: 'build', space: 1 }))).toBe('CANT_BUILD');
  });

  it('needs the cash', () => {
    const s = brown(0, (d) => {
      seat(d, 'wren').cash = 49;
    });
    expect(codeOf(() => act(s, 'wren', { type: 'build', space: 1 }))).toBe('CANT_BUILD');
  });

  it('the fifth building is a hotel that returns four houses to the bank', () => {
    const s = brown(4, (d) => {
      d.bankHouses = 3;
    });
    const after = act(s, 'wren', { type: 'build', space: 1 });
    expect(deed(after, 1)!.houses).toBe(5);
    expect(after.bankHotels).toBe(11);
    expect(after.bankHouses).toBe(7);
    expect(seat(after, 'wren').cash).toBe(1450);
  });

  it('nothing is built on a hotel street', () => {
    const s = brown(5);
    expect(codeOf(() => act(s, 'wren', { type: 'build', space: 1 }))).toBe('CANT_BUILD');
  });

  it('is limited by the 32 houses in the bank', () => {
    const s = brown(0, (d) => {
      d.bankHouses = 0;
    });
    expect(codeOf(() => act(s, 'wren', { type: 'build', space: 1 }))).toBe('CANT_BUILD');
    const last = brown(0, (d) => {
      d.bankHouses = 1;
    });
    const one = act(last, 'wren', { type: 'build', space: 1 });
    expect(one.bankHouses).toBe(0);
    expect(codeOf(() => act(one, 'wren', { type: 'build', space: 3 }))).toBe('CANT_BUILD');
  });

  it('is limited by the 12 hotels in the bank', () => {
    const s = brown(4, (d) => {
      d.bankHotels = 0;
    });
    expect(codeOf(() => act(s, 'wren', { type: 'build', space: 1 }))).toBe('CANT_BUILD');
  });

  it('selling returns half the cost and a house to the bank', () => {
    const s = act(brown(2), 'wren', { type: 'sell', space: 1 });
    expect(deed(s, 1)!.houses).toBe(1);
    expect(seat(s, 'wren').cash).toBe(1525);
    expect(s.bankHouses).toBe(33);
  });

  it('sells evenly: the most built street goes first', () => {
    const s = edit(brown(), (d) => {
      deed(d, 1)!.houses = 2;
      deed(d, 3)!.houses = 1;
    });
    expect(codeOf(() => act(s, 'wren', { type: 'sell', space: 3 }))).toBe('CANT_SELL');
    const after = act(s, 'wren', { type: 'sell', space: 1 });
    expect(deed(after, 1)!.houses).toBe(1);
  });

  it('cannot sell where nothing is built, or from a deed that is not yours', () => {
    expect(codeOf(() => act(brown(), 'wren', { type: 'sell', space: 1 }))).toBe('CANT_SELL');
    expect(codeOf(() => act(brown(1), 'rook', { type: 'sell', space: 1 }))).toBe('CANT_SELL');
  });

  it('a hotel sells down to four houses', () => {
    const s = brown(5, (d) => {
      d.bankHouses = 10;
      d.bankHotels = 5;
    });
    const after = act(s, 'wren', { type: 'sell', space: 1 });
    expect(deed(after, 1)!.houses).toBe(4);
    expect(after.bankHotels).toBe(6);
    expect(after.bankHouses).toBe(6);
    expect(seat(after, 'wren').cash).toBe(1525);
  });

  it('a hotel sells down to fewer houses when the bank is short', () => {
    const s = brown(5, (d) => {
      d.bankHouses = 2;
    });
    const after = act(s, 'wren', { type: 'sell', space: 1 });
    expect(deed(after, 1)!.houses).toBe(2);
    expect(after.bankHouses).toBe(0);
    expect(seat(after, 'wren').cash).toBe(1500 + 3 * 25);
  });
});

/* ------------------------------------------------------------------ mortgages */

describe('mortgages', () => {
  it('mortgaging pays half the price', () => {
    const s = act(
      edit(base(), (d) => own(d, 'wren', [1])),
      'wren',
      { type: 'mortgage', space: 1 },
    );
    expect(deed(s, 1)!.mortgaged).toBe(true);
    expect(seat(s, 'wren').cash).toBe(1530);
  });

  it('lifting a mortgage costs the loan plus 10%', () => {
    const mortgaged = edit(base(), (d) => {
      own(d, 'wren', [1], 0, true);
      own(d, 'wren', [5], 0, true);
      own(d, 'wren', [39], 0, true);
    });
    const a = act(mortgaged, 'wren', { type: 'unmortgage', space: 1 });
    expect(seat(a, 'wren').cash).toBe(1500 - 33);
    expect(deed(a, 1)!.mortgaged).toBe(false);
    const b = act(mortgaged, 'wren', { type: 'unmortgage', space: 5 });
    expect(seat(b, 'wren').cash).toBe(1500 - 110);
    const c = act(mortgaged, 'wren', { type: 'unmortgage', space: 39 });
    expect(seat(c, 'wren').cash).toBe(1500 - 220);
  });

  it('works on railroads and utilities too', () => {
    const s = act(
      edit(base(), (d) => own(d, 'wren', [5, 12])),
      'wren',
      { type: 'mortgage', space: 12 },
    );
    expect(seat(s, 'wren').cash).toBe(1575);
  });

  it('is blocked while any street in the group has buildings', () => {
    const s = edit(base(), (d) => {
      own(d, 'wren', [1, 3]);
      deed(d, 3)!.houses = 1;
    });
    expect(codeOf(() => act(s, 'wren', { type: 'mortgage', space: 1 }))).toBe('CANT_MORTGAGE');
    expect(codeOf(() => act(s, 'wren', { type: 'mortgage', space: 3 }))).toBe('CANT_MORTGAGE');
  });

  it('is allowed again after selling the buildings', () => {
    const s = edit(base(), (d) => {
      own(d, 'wren', [1, 3]);
      deed(d, 3)!.houses = 1;
    });
    const sold = act(s, 'wren', { type: 'sell', space: 3 });
    const after = act(sold, 'wren', { type: 'mortgage', space: 1 });
    expect(deed(after, 1)!.mortgaged).toBe(true);
  });

  it('rejects mortgaging twice, mortgaging a deed you do not own, and lifting a free deed', () => {
    const s = edit(base(), (d) => {
      own(d, 'wren', [1], 0, true);
      own(d, 'wren', [3]);
    });
    expect(codeOf(() => act(s, 'wren', { type: 'mortgage', space: 1 }))).toBe('CANT_MORTGAGE');
    expect(codeOf(() => act(s, 'rook', { type: 'mortgage', space: 3 }))).toBe('CANT_MORTGAGE');
    expect(codeOf(() => act(s, 'wren', { type: 'unmortgage', space: 3 }))).toBe('NOT_MORTGAGED');
    expect(codeOf(() => act(s, 'rook', { type: 'unmortgage', space: 1 }))).toBe('NOT_YOURS');
  });

  it('lifting needs the cash', () => {
    const s = edit(base(), (d) => {
      own(d, 'wren', [1], 0, true);
      seat(d, 'wren').cash = 32;
    });
    expect(codeOf(() => act(s, 'wren', { type: 'unmortgage', space: 1 }))).toBe('NO_CASH');
  });
});

/* ------------------------------------------------------------------ debts and bankruptcy */

describe('debts and bankruptcy', () => {
  it('an unaffordable rent enters the debt phase when the debtor can raise it', () => {
    const s = debtScene();
    expect(s.phase).toBe('debt');
    expect(s.debts).toHaveLength(1);
    expect(s.debts[0]).toMatchObject({ from: 'rook', to: 'wren', amount: 320, why: 'rent' });
    expect(seat(s, 'rook').cash).toBe(100);
    expect(seat(s, 'wren').cash).toBe(1500);
    expect(game.waitingOn!(s)).toEqual(['rook']);
  });

  it('nobody else can end the turn, roll or bankrupt the debtor while a debt is open', () => {
    const s = debtScene();
    expect(codeOf(() => act(s, 'wren', { type: 'end' }))).toBe('NOT_YOUR_TURN');
    expect(codeOf(() => act(s, 'rook', { type: 'roll' }))).toBe('NOT_YOUR_TURN');
    expect(codeOf(() => act(s, 'wren', { type: 'bankrupt' }))).toBe('NOT_NOW');
  });

  it('raising the money by mortgaging settles the debt automatically', () => {
    let s = debtScene();
    s = act(s, 'rook', { type: 'mortgage', space: 21 });
    expect(s.phase).toBe('debt');
    expect(seat(s, 'rook').cash).toBe(210);
    s = act(s, 'rook', { type: 'mortgage', space: 23 });
    expect(s.debts).toEqual([]);
    expect(s.phase).toBe('done');
    expect(seat(s, 'rook').cash).toBe(0);
    expect(seat(s, 'wren').cash).toBe(1820);
    expect(s.rent['wren']).toBe(320);
  });

  it('raising the money by selling buildings settles the debt automatically', () => {
    let s = debtScene(TWO, [21, 23, 24], 1);
    expect(s.phase).toBe('debt');
    s = act(s, 'rook', { type: 'sell', space: 21 });
    s = act(s, 'rook', { type: 'sell', space: 23 });
    expect(s.phase).toBe('debt');
    expect(seat(s, 'rook').cash).toBe(250);
    s = act(s, 'rook', { type: 'sell', space: 24 });
    expect(s.phase).toBe('done');
    expect(seat(s, 'rook').cash).toBe(5);
    expect(seat(s, 'wren').cash).toBe(1820);
  });

  it('a debt can also be cleared by a trade that brings in cash', () => {
    let s = debtScene(THREE);
    s = act(s, 'magpie', { type: 'offer', to: 'rook', give: side({ cash: 250 }), get: side() });
    s = act(s, 'rook', { type: 'accept', id: s.offers[0]!.id });
    expect(s.phase).toBe('done');
    expect(seat(s, 'rook').cash).toBe(30);
    expect(seat(s, 'wren').cash).toBe(1820);
  });

  it('a debtor can give up and hand everything to the creditor', () => {
    const s = act(debtScene(THREE), 'rook', { type: 'bankrupt' });
    expect(seat(s, 'rook').out).toBe(true);
    expect(seat(s, 'wren').cash).toBe(1600);
    for (const d of [21, 23, 24]) expect(deed(s, d)!.owner).toBe('wren');
    expect(s.fallen).toEqual(['rook']);
    expect(s.debts).toEqual([]);
    expect(s.turn).toBe('magpie');
    expect(s.phase).toBe('roll');
  });

  it('cannot give up when not in debt', () => {
    expect(codeOf(() => act(base(), 'wren', { type: 'bankrupt' }))).toBe('NOT_NOW');
  });

  it('a debt that cannot be met even by selling everything bankrupts straight to the creditor', () => {
    const s = edit(base(THREE), (d) => {
      own(d, 'wren', [1, 3], 4);
      own(d, 'rook', [39]);
      seat(d, 'rook').cash = 100;
      d.turn = 'rook';
    });
    expect(liquidValue(s, 'rook')).toBe(300);
    const after = act(s, 'rook', { type: 'roll' }, dice(1, 2));
    expect(seat(after, 'rook').out).toBe(true);
    expect(seat(after, 'rook').cash).toBe(0);
    expect(seat(after, 'wren').cash).toBe(1600);
    expect(deed(after, 39)!.owner).toBe('wren');
    expect(after.fallen).toEqual(['rook']);
    expect(after.phase).toBe('roll');
    expect(after.turn).toBe('magpie');
  });

  it("a creditor receives the bankrupt player's buildings sold off and Jail cards", () => {
    const s = edit(base(THREE), (d) => {
      own(d, 'wren', [1, 3], 4);
      own(d, 'rook', [31, 32, 34], 1);
      giveCard(d, 'rook', 'chance8');
      seat(d, 'rook').cash = 0;
      d.turn = 'rook';
    });
    // Rook's liquid worth is far above 320, so rook is in debt rather than out.
    const debt = act(s, 'rook', { type: 'roll' }, dice(1, 2));
    expect(debt.phase).toBe('debt');
    const after = act(debt, 'rook', { type: 'bankrupt' });
    expect(seat(after, 'wren').cards).toEqual(['chance8']);
    expect(deed(after, 31)!.houses).toBe(0);
    expect(after.bankHouses).toBe(s.bankHouses + 3);
    expect(seat(after, 'wren').cash).toBe(1500 + 3 * 100);
  });

  it('bankruptcy to the bank frees the deeds and returns Jail cards to their deck', () => {
    const s = edit(base(THREE), (d) => {
      own(d, 'rook', [37], 0, true);
      giveCard(d, 'rook', 'chance8');
      seat(d, 'rook').cash = 100;
      seat(d, 'rook').pos = 1;
      d.turn = 'rook';
    });
    const after = act(s, 'rook', { type: 'roll' }, dice(1, 2));
    expect(seat(after, 'rook').out).toBe(true);
    expect(deed(after, 37)).toBeUndefined();
    expect(seat(after, 'rook').cards).toEqual([]);
    expect(after.decks.chance).toHaveLength(16);
    expect(after.decks.chance).toContain('chance8');
    expect(seat(after, 'wren').cash).toBe(1500);
    expect(after.turn).toBe('magpie');
  });

  it('a bankrupt player is out: no actions, skipped in the turn order, and their offers vanish', () => {
    let s = edit(base(THREE), (d) => {
      own(d, 'rook', [37], 0, true);
      seat(d, 'rook').cash = 100;
      seat(d, 'rook').pos = 1;
      d.turn = 'rook';
    });
    s = act(s, 'magpie', { type: 'offer', to: 'rook', give: side({ cash: 5 }), get: side() });
    s = act(s, 'rook', { type: 'roll' }, dice(1, 2));
    expect(s.offers).toEqual([]);
    expect(codeOf(() => act(s, 'rook', { type: 'roll' }))).toBe('OUT');
    s = act(s, 'magpie', { type: 'roll' }, dice(1, 3));
    s = act(s, 'magpie', { type: 'end' });
    expect(s.turn).toBe('wren');
  });

  it('liquidValue counts cash, half of buildings and unmortgaged deeds at loan value', () => {
    const s = edit(base(), (d) => {
      own(d, 'wren', [1, 3], 2);
      own(d, 'wren', [5], 0, true);
    });
    expect(liquidValue(s, 'wren')).toBe(1500 + 4 * 25 + 30 + 30);
  });
});

/* ------------------------------------------------------------------ trades */

describe('trades', () => {
  const traders = () =>
    edit(base(THREE), (d) => {
      own(d, 'wren', [1]);
      own(d, 'rook', [3]);
    });
  const offer = (
    s: MonopolyState,
    from: string,
    to: string,
    give: Partial<TradeSide>,
    get: Partial<TradeSide>,
  ) => act(s, from, { type: 'offer', to, give: side(give), get: side(get) });

  it('an offer waits for an answer without ending anything', () => {
    const s = offer(traders(), 'wren', 'rook', { deeds: [1] }, { cash: 50 });
    expect(s.offers).toHaveLength(1);
    expect(s.offers[0]).toMatchObject({ from: 'wren', to: 'rook' });
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe('wren');
  });

  it('the recipient accepts and the goods change hands', () => {
    let s = offer(traders(), 'wren', 'rook', { deeds: [1], cash: 20 }, { deeds: [3], cash: 50 });
    s = act(s, 'rook', { type: 'accept', id: s.offers[0]!.id });
    expect(deed(s, 1)!.owner).toBe('rook');
    expect(deed(s, 3)!.owner).toBe('wren');
    expect(seat(s, 'wren').cash).toBe(1530);
    expect(seat(s, 'rook').cash).toBe(1470);
    expect(s.offers).toEqual([]);
  });

  it('trades Jail cards', () => {
    let s = edit(traders(), (d) => giveCard(d, 'wren', 'chance8'));
    s = offer(s, 'wren', 'rook', { cards: 1 }, { cash: 10 });
    s = act(s, 'rook', { type: 'accept', id: s.offers[0]!.id });
    expect(seat(s, 'wren').cards).toEqual([]);
    expect(seat(s, 'rook').cards).toEqual(['chance8']);
  });

  it('rejecting removes the offer and changes nothing', () => {
    let s = offer(traders(), 'wren', 'rook', { deeds: [1] }, { cash: 50 });
    s = act(s, 'rook', { type: 'reject', id: s.offers[0]!.id });
    expect(s.offers).toEqual([]);
    expect(deed(s, 1)!.owner).toBe('wren');
    expect(seat(s, 'rook').cash).toBe(1500);
  });

  it('the sender can cancel; only the sender cancels and only the recipient answers', () => {
    const s = offer(traders(), 'wren', 'rook', { deeds: [1] }, { cash: 50 });
    const id = s.offers[0]!.id;
    expect(codeOf(() => act(s, 'rook', { type: 'cancel', id }))).toBe('NOT_YOURS');
    expect(codeOf(() => act(s, 'wren', { type: 'accept', id }))).toBe('NOT_YOURS');
    expect(codeOf(() => act(s, 'wren', { type: 'reject', id }))).toBe('NOT_YOURS');
    expect(codeOf(() => act(s, 'magpie', { type: 'accept', id }))).toBe('NOT_YOURS');
    const gone = act(s, 'wren', { type: 'cancel', id });
    expect(gone.offers).toEqual([]);
    expect(codeOf(() => act(gone, 'rook', { type: 'accept', id }))).toBe('NO_OFFER');
  });

  it('a new offer from the same player replaces their old one', () => {
    let s = offer(traders(), 'wren', 'rook', { deeds: [1] }, { cash: 50 });
    s = offer(s, 'wren', 'magpie', { cash: 10 }, {});
    expect(s.offers).toHaveLength(1);
    expect(s.offers[0]!.to).toBe('magpie');
  });

  it('rejects trading a deed that is not yours or not theirs', () => {
    const s = traders();
    expect(codeOf(() => offer(s, 'wren', 'rook', { deeds: [3] }, {}))).toBe('BAD_TRADE');
    expect(codeOf(() => offer(s, 'wren', 'rook', { deeds: [1] }, { deeds: [1] }))).toBe(
      'BAD_TRADE',
    );
    expect(codeOf(() => offer(s, 'wren', 'rook', { deeds: [39] }, {}))).toBe('BAD_TRADE');
  });

  it('rejects trading a deed whose colour group has buildings', () => {
    const s = edit(base(THREE), (d) => {
      own(d, 'wren', [1, 3], 1);
    });
    expect(codeOf(() => offer(s, 'wren', 'rook', { deeds: [1] }, {}))).toBe('BAD_TRADE');
    const theirs = edit(base(THREE), (d) => {
      own(d, 'wren', [1], 0);
      own(d, 'rook', [3], 0);
      deed(d, 1)!.houses = 1;
    });
    expect(codeOf(() => offer(theirs, 'rook', 'wren', { deeds: [3] }, {}))).toBe('BAD_TRADE');
  });

  it('rejects offering more cash than you have, or Jail cards you lack', () => {
    const s = traders();
    expect(codeOf(() => offer(s, 'wren', 'rook', { cash: 1501 }, {}))).toBe('BAD_TRADE');
    expect(codeOf(() => offer(s, 'wren', 'rook', { cards: 1 }, {}))).toBe('BAD_TRADE');
  });

  it('rejects an empty offer, an offer to yourself or to a stranger', () => {
    const s = traders();
    expect(codeOf(() => offer(s, 'wren', 'rook', {}, {}))).toBe('BAD_TRADE');
    expect(codeOf(() => offer(s, 'wren', 'wren', { cash: 5 }, {}))).toBe('BAD_TRADE');
    expect(codeOf(() => offer(s, 'wren', 'nobody', { cash: 5 }, {}))).toBe('NOT_A_PLAYER');
  });

  it('accepting re-checks the cash of both sides', () => {
    const s = offer(traders(), 'wren', 'rook', { cash: 10 }, { cash: 5_000 });
    expect(codeOf(() => act(s, 'rook', { type: 'accept', id: s.offers[0]!.id }))).toBe('BAD_TRADE');
    const spent = edit(offer(traders(), 'wren', 'rook', { cash: 400 }, {}), (d) => {
      seat(d, 'wren').cash = 100;
    });
    expect(codeOf(() => act(spent, 'rook', { type: 'accept', id: spent.offers[0]!.id }))).toBe(
      'BAD_TRADE',
    );
  });

  it('an accepted deed invalidates every other offer that includes it', () => {
    let s = edit(base(THREE), (d) => own(d, 'rook', [1]));
    s = offer(s, 'wren', 'rook', { cash: 50 }, { deeds: [1] });
    s = offer(s, 'magpie', 'rook', { cash: 60 }, { deeds: [1] });
    expect(s.offers).toHaveLength(2);
    const first = s.offers.find((o) => o.from === 'wren')!;
    s = act(s, 'rook', { type: 'accept', id: first.id });
    expect(deed(s, 1)!.owner).toBe('wren');
    expect(s.offers.some((o) => o.from === 'magpie' && o.to === 'rook')).toBe(false);
  });

  it('trades continue to work outside your own turn', () => {
    const s = offer(traders(), 'rook', 'magpie', { cash: 5 }, {});
    expect(s.offers).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ game end */

describe('game end', () => {
  const lastOne = () => {
    const s = edit(base(), (d) => {
      own(d, 'wren', [1, 3], 4);
      own(d, 'rook', [39]);
      seat(d, 'rook').cash = 100;
      d.turn = 'rook';
    });
    return act(s, 'rook', { type: 'roll' }, dice(1, 2), 5_000);
  };

  it('the last player standing ends the game with a show moment', () => {
    const s = lastOne();
    expect(s.phase).toBe('show');
    expect(s.winners).toEqual(['wren']);
    expect(s.showBy).toBe(5_000 + SHOW_MS);
    expect(game.waitingOn!(s)).toEqual([]);
    expect(game.getResult!(s)).toBeNull();
    expect(game.nextTimer!(s)).toEqual({ id: 'show', at: 5_000 + SHOW_MS });
    expect(codeOf(() => act(s, 'wren', { type: 'roll' }))).toBe('GAME_OVER');
  });

  it('the show timer moves it to over and the result names the winner', () => {
    const shown = lastOne();
    const over = game.onTimer!(shown, 'show', createRng(1), shown.showBy!);
    expect(over.phase).toBe('over');
    expect(game.nextTimer!(over)).toBeNull();
    const result = game.getResult!(over)!;
    expect(result.winners).toEqual(['wren']);
    expect(result.standings).toEqual([
      { playerId: 'wren', outcome: 'win' },
      { playerId: 'rook', outcome: 'loss' },
    ]);
    expect(result.summary).toBe('The last one standing.');
    expect(codeOf(() => act(over, 'wren', { type: 'roll' }))).toBe('GAME_OVER');
  });

  it('the round limit picks the richest by net worth', () => {
    const s = edit(base(TWO, { ends: 'After 20 rounds' }), (d) => {
      d.round = 20;
      d.turn = 'rook';
      d.phase = 'done';
      d.after = 'done';
      own(d, 'wren', [39]);
    });
    expect(netWorth(s, 'wren')).toBe(1900);
    const after = act(s, 'rook', { type: 'end' });
    expect(after.phase).toBe('show');
    expect(after.winners).toEqual(['wren']);
    expect(after.round).toBe(20);
    const over = game.onTimer!(after, 'show', createRng(1), after.showBy!);
    expect(game.getResult!(over)!.summary).toContain('20 rounds');
  });

  it('the round limit does not end the game before the last turn of the last round', () => {
    const s = edit(base(TWO, { ends: 'After 20 rounds' }), (d) => {
      d.round = 20;
      d.turn = 'wren';
      d.phase = 'done';
      d.after = 'done';
    });
    const after = act(s, 'wren', { type: 'end' });
    expect(after.phase).toBe('roll');
    expect(after.turn).toBe('rook');
  });

  it('counts houses at cost and mortgaged deeds at loan value in net worth', () => {
    const s = edit(base(), (d) => {
      own(d, 'wren', [1, 3], 2);
      own(d, 'wren', [5], 0, true);
    });
    expect(netWorth(s, 'wren')).toBe(1500 + 120 + 4 * 50 + 100);
  });

  it('a tie on net worth is a draw', () => {
    const s = edit(base(TWO, { ends: 'After 20 rounds' }), (d) => {
      d.round = 20;
      d.turn = 'rook';
      d.phase = 'done';
      d.after = 'done';
    });
    const after = act(s, 'rook', { type: 'end' });
    expect(after.winners).toEqual(['wren', 'rook']);
    const over = game.onTimer!(after, 'show', createRng(1), after.showBy!);
    expect(game.getResult!(over)!.standings!.map((x) => x.outcome)).toEqual(['draw', 'draw']);
  });

  it('getResult is null while the game is on', () => {
    expect(game.getResult!(base())).toBeNull();
  });

  it('the Landlord award goes to whoever collected the most rent', () => {
    const shown = edit(lastOne(), (d) => {
      d.rent = { wren: 500, rook: 20 };
    });
    const over = game.onTimer!(shown, 'show', createRng(1), shown.showBy!);
    const result = game.getResult!(over)!;
    expect(result.highlights).toEqual([
      expect.objectContaining({ award: 'Landlord', playerIds: ['wren'], value: 500 }),
    ]);
  });

  describe('partialResult', () => {
    it('is null before anything has happened', () => {
      expect(game.partialResult!(base())).toBeNull();
    });

    it('names the richest as it stands, or a level result', () => {
      let s = act(base(), 'wren', { type: 'roll' }, dice(1, 2));
      expect(game.partialResult!(s)!.winners).toEqual(['wren', 'rook']);
      expect(game.partialResult!(s)!.summary).toBe('Level on worth.');
      s = edit(s, (d) => {
        seat(d, 'rook').cash += 100;
      });
      const partial = game.partialResult!(s)!;
      expect(partial.winners).toEqual(['rook']);
      expect(partial.summary).toBe('The richest when the game ended.');
    });

    it('uses the real winners once the game has been decided', () => {
      const shown = lastOne();
      expect(game.partialResult!(shown)!.winners).toEqual(['wren']);
      const over = game.onTimer!(shown, 'show', createRng(1), shown.showBy!);
      expect(game.partialResult!(over)!.winners).toEqual(['wren']);
    });
  });
});

/* ------------------------------------------------------------------ turn timer */

describe('turn timer', () => {
  const timed = (options: Partial<MonopolyOptions> = {}, players = TWO) =>
    base(players, { turnTimer: '60 seconds', ...options }, 1_000);

  it('is set at setup and counts down for the player to move', () => {
    const s = timed();
    expect(s.actBy).toBe(1_000 + 60_000);
    expect(game.nextTimer!(s)).toEqual({ id: 'turn', at: 61_000 });
  });

  it('does nothing before the deadline', () => {
    const s = timed();
    expect(game.onTimer!(s, 'turn', createRng(1), 60_999)).toBe(s);
  });

  it('rolls for a player who is out of time, then restarts the clock for the next decision', () => {
    const s = game.onTimer!(timed(), 'turn', dice(1, 2), 61_000);
    expect(seat(s, 'wren').pos).toBe(3);
    expect(s.phase).toBe('buy');
    expect(s.actBy).toBe(61_000 + 60_000);
  });

  it('declines a purchase that runs out of time (to auction)', () => {
    const rolled = game.onTimer!(timed(), 'turn', dice(1, 2), 61_000);
    const s = game.onTimer!(rolled, 'turn', createRng(1), rolled.actBy!);
    expect(s.phase).toBe('auction');
    expect(s.actBy).toBeNull();
    expect(game.nextTimer!(s)).toEqual({ id: 'auction', at: rolled.actBy! + AUCTION_MS });
  });

  it('ends the turn of a player who is out of time at the end of their move', () => {
    let s = game.onTimer!(timed({ unbought: 'Stays with the bank' }), 'turn', dice(1, 2), 61_000);
    s = game.onTimer!(s, 'turn', createRng(1), s.actBy!);
    expect(s.phase).toBe('done');
    s = game.onTimer!(s, 'turn', createRng(1), s.actBy!);
    expect(s.turn).toBe('rook');
    expect(s.phase).toBe('roll');
    expect(s.actBy).not.toBeNull();
  });

  it('raises the money for a debt by mortgaging the cheapest deeds, then carries on', () => {
    const s0 = edit(timed(), (d) => {
      own(d, 'wren', [1, 3], 4);
      own(d, 'rook', [21, 23, 24]);
      seat(d, 'rook').cash = 100;
      d.turn = 'rook';
    });
    const s = act(s0, 'rook', { type: 'roll' }, dice(1, 2), 2_000);
    expect(s.phase).toBe('debt');
    expect(s.actBy).toBe(2_000 + 60_000);
    const after = game.onTimer!(s, 'turn', createRng(1), s.actBy!);
    expect(after.phase).toBe('done');
    expect(seat(after, 'rook').cash).toBe(0);
    expect(deed(after, 21)!.mortgaged).toBe(true);
    expect(deed(after, 23)!.mortgaged).toBe(true);
    expect(deed(after, 24)!.mortgaged).toBe(false);
    expect(seat(after, 'wren').cash).toBe(1820);
  });

  it('sells buildings before mortgaging when raising money', () => {
    const s0 = edit(timed(), (d) => {
      own(d, 'wren', [1, 3], 4);
      own(d, 'rook', [21, 23, 24], 1);
      seat(d, 'rook').cash = 100;
      d.turn = 'rook';
    });
    const s = act(s0, 'rook', { type: 'roll' }, dice(1, 2), 2_000);
    const after = game.onTimer!(s, 'turn', createRng(1), s.actBy!);
    expect(after.phase).toBe('done');
    for (const d of [21, 23, 24]) {
      expect(deed(after, d)!.mortgaged).toBe(false);
      expect(deed(after, d)!.houses).toBe(0);
    }
  });

  it('a timer with no timer setting is ignored', () => {
    const s = base();
    expect(game.onTimer!(s, 'turn', createRng(1), 10_000_000)).toBe(s);
  });
});

/* ------------------------------------------------------------------ hidden information */

describe('hidden information', () => {
  const states = () => {
    const fresh = base(THREE);
    const drawn = landOn(
      edit(fresh, (d) => topCard(d, 'chance', 'chance7')),
      'wren',
      7,
      3,
      4,
    );
    const jailCard = edit(drawn, (d) => giveCard(d, 'rook', 'chest5'));
    return [fresh, drawn, jailCard];
  };

  it('never puts the deck order in a player view or the table view', () => {
    for (const s of states()) {
      const views = [...s.players.map((id) => game.getPlayerView(s, id)), game.getTableView(s)];
      for (const v of views) {
        const json = JSON.stringify(v);
        expect(Object.keys(v)).not.toContain('decks');
        expect(json).not.toContain('"decks"');
        expect(json).not.toContain(JSON.stringify(s.decks.chance));
        expect(json).not.toContain(JSON.stringify(s.decks.chest));
        for (const deck of [s.decks.chance, s.decks.chest]) {
          for (let i = 0; i + 1 < deck.length; i++) {
            expect(json).not.toContain(`"${deck[i]}","${deck[i + 1]}"`);
          }
        }
      }
    }
  });

  it('the seats expose only a count of Jail cards, not which ones', () => {
    const s = states()[2]!;
    const view = game.getPlayerView(s, 'wren');
    expect(view.seats['rook']!.cards).toBe(1);
    expect(JSON.stringify(view)).not.toContain('chest5');
  });

  it('shows only the card just drawn, with its text', () => {
    const drawn = states()[1]!;
    const view = game.getTableView(drawn);
    expect(view.card).toMatchObject({ id: 'chance7', by: 'wren', deck: 'chance' });
    expect(view.card!.text).toContain('$50');
    const json = JSON.stringify(view);
    for (const id of drawn.decks.chance.filter((c) => c !== 'chance7')) {
      expect(json).not.toContain(`"${id}"`);
    }
  });

  it('a player view is the table view plus who is looking', () => {
    const s = states()[1]!;
    const view = game.getPlayerView(s, 'rook');
    expect(view.me).toBe('rook');
    expect(view).toEqual({ ...game.getTableView(s), me: 'rook' });
  });

  it('the result reveal does not leak the decks either', () => {
    const shown = edit(base(), (d) => {
      d.phase = 'over';
      d.winners = ['wren'];
    });
    const json = JSON.stringify(game.getResult!(shown));
    expect(json).not.toContain('"decks"');
    expect(json).not.toContain('chance1');
  });
});

/* ------------------------------------------------------------------ waitingOn */

describe('waitingOn', () => {
  it('is the player to roll', () => {
    expect(game.waitingOn!(base())).toEqual(['wren']);
  });

  it('is the player to buy', () => {
    const s = act(base(), 'wren', { type: 'roll' }, dice(1, 2));
    expect(game.waitingOn!(s)).toEqual(['wren']);
  });

  it('is the player to end their turn', () => {
    const s = act(base(), 'wren', { type: 'roll' }, dice(1, 3));
    expect(s.phase).toBe('done');
    expect(game.waitingOn!(s)).toEqual(['wren']);
  });

  it('is the debtor in the debt phase', () => {
    expect(game.waitingOn!(debtScene())).toEqual(['rook']);
  });

  it('in an auction is everyone still in it except the top bidder', () => {
    let s = act(act(base(THREE), 'wren', { type: 'roll' }, dice(1, 2)), 'wren', {
      type: 'decline',
    });
    expect([...game.waitingOn!(s)].sort()).toEqual(['magpie', 'rook', 'wren']);
    s = act(s, 'rook', { type: 'bid', amount: 10 });
    expect([...game.waitingOn!(s)].sort()).toEqual(['magpie', 'wren']);
    s = act(s, 'wren', { type: 'pass' });
    expect(game.waitingOn!(s)).toEqual(['magpie']);
  });

  it('includes the recipient of a trade offer', () => {
    const s = act(base(THREE), 'wren', {
      type: 'offer',
      to: 'magpie',
      give: side({ cash: 10 }),
      get: side(),
    });
    expect([...game.waitingOn!(s)].sort()).toEqual(['magpie', 'wren']);
    const answered = act(s, 'magpie', { type: 'reject', id: s.offers[0]!.id });
    expect(game.waitingOn!(answered)).toEqual(['wren']);
  });

  it('includes the recipient of an offer during the debt phase, once', () => {
    let s = debtScene(THREE);
    s = act(s, 'magpie', { type: 'offer', to: 'rook', give: side({ cash: 5 }), get: side() });
    expect([...game.waitingOn!(s)].sort()).toEqual(['rook']);
    s = act(s, 'magpie', { type: 'offer', to: 'wren', give: side({ cash: 5 }), get: side() });
    expect([...game.waitingOn!(s)].sort()).toEqual(['rook', 'wren']);
  });

  it('is nobody once the game is decided', () => {
    const s = edit(base(), (d) => {
      d.phase = 'show';
    });
    expect(game.waitingOn!(s)).toEqual([]);
    expect(game.waitingOn!(edit(s, (d) => void (d.phase = 'over')))).toEqual([]);
  });
});

describe('the market-town board', () => {
  const town = () =>
    game.setup({
      playerIds: ['wren', 'rook'],
      options: { ...game.defaultOptions(2), board: 'Market town' },
      rng: createRng(1),
      now: 0,
    });

  it('defaults to the classic names', () => {
    expect(game.defaultOptions(2).board).toBe('Classic');
    expect(spaceName(39)).toBe('Boardwalk');
    expect(cardText('chance14')).toBe('Advance to Boardwalk.');
  });

  it('wears the town names in views, cards and the log', () => {
    const s = town();
    expect(s.names).toBe('town');
    expect(game.getTableView(s).names).toBe('town');
    expect(spaceName(39, 'town')).toBe('Crown Terrace');
    expect(cardText('chance14', 'town')).toBe('Stroll up to Crown Terrace.');
    const d = structuredClone(s);
    d.phase = 'buy';
    d.turn = 'wren';
    d.seats.wren!.pos = 1;
    d.pendingBuy = 1;
    const after = game.applyAction(d, 'wren', { type: 'buy' }, createRng(2), 10);
    expect(after.log.at(-1)!.text).toContain('Mudlark Row');
    expect(describeSide({ cash: 0, deeds: [5], cards: 0 }, 'town')).toBe('The Swan');
  });
});
